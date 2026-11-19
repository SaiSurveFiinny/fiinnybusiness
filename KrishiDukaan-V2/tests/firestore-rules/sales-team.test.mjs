import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

// Email-based admin-portal accounts live at users/{uid} (uid == doc id), so
// the rules resolve role via isDirect*() reads on users/{request.auth.uid}.
const ADMIN = 'adminUid', ST = 'salesTeamUid', OT = 'ordersTeamUid', EX = 'execUid';
const CUST = '+919000000099';

const env = await initializeTestEnvironment({
  projectId: 'kd-rules-test',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', ADMIN), { role: 'admin', uid: ADMIN });
  await setDoc(doc(db, 'users', ST), { role: 'team', uid: ST, adminSections: ['salesTeam'] });
  await setDoc(doc(db, 'users', OT), { role: 'team', uid: OT, adminSections: ['orders'] });
  await setDoc(doc(db, 'users', EX), { role: 'salesExecutive', uid: EX, name: 'Field Rep' });
  await setDoc(doc(db, 'users', CUST), { role: 'customer', uid: 'custUid', phone: CUST });
  await setDoc(doc(db, 'dealers', 'd1'), { createdBy: EX, active: true, shopName: 'Krishi' });
  await setDoc(doc(db, 'dealerVisits', 'v1'), { salesExecutiveId: EX, dealerId: 'd1' });
  await setDoc(doc(db, 'daySessions', 'ds1'), { salesExecutiveId: EX, status: 'ACTIVE' });
  await setDoc(doc(db, 'dealerNotes', 'n1'), { salesExecutiveId: EX, dealerId: 'd1', text: 'hi' });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const admin = as(ADMIN), st = as(ST), ot = as(OT);

let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '-', String(e?.message ?? e).slice(0, 300)); } }

console.log('admin keeps full access');
await t('admin reads exec roster', assertSucceeds(getDocs(query(collection(admin, 'users'), where('role', 'in', ['salesExecutive'])))));
await t('admin reads dealerVisits', assertSucceeds(getDocs(collection(admin, 'dealerVisits'))));
await t('admin reads dealers', assertSucceeds(getDoc(doc(admin, 'dealers', 'd1'))));
await t('admin reads daySessions', assertSucceeds(getDoc(doc(admin, 'daySessions', 'ds1'))));

console.log('team member WITH salesTeam');
await t('ST reads exec roster (role==salesExecutive)', assertSucceeds(getDocs(query(collection(st, 'users'), where('role', 'in', ['salesExecutive'])))));
await t('ST reads an exec user doc', assertSucceeds(getDoc(doc(st, 'users', EX))));
await t('ST reads dealerVisits collection', assertSucceeds(getDocs(collection(st, 'dealerVisits'))));
await t('ST reads a dealer', assertSucceeds(getDoc(doc(st, 'dealers', 'd1'))));
await t('ST reads a daySession', assertSucceeds(getDoc(doc(st, 'daySessions', 'ds1'))));
await t('ST reads a dealerNote', assertSucceeds(getDoc(doc(st, 'dealerNotes', 'n1'))));
// Scope + write guards — the grant must not leak farmer data or allow writes.
await t('ST canNOT read a customer user doc', assertFails(getDoc(doc(st, 'users', CUST))));
await t('ST canNOT write a dealer', assertFails(updateDoc(doc(st, 'dealers', 'd1'), { shopName: 'x' })));
await t('ST canNOT write a dealerVisit', assertFails(updateDoc(doc(st, 'dealerVisits', 'v1'), { dealerId: 'z' })));

console.log('team member WITHOUT salesTeam (only orders)');
await t('OT canNOT read dealerVisits', assertFails(getDocs(collection(ot, 'dealerVisits'))));
await t('OT canNOT read a dealer', assertFails(getDoc(doc(ot, 'dealers', 'd1'))));
await t('OT canNOT read a daySession', assertFails(getDoc(doc(ot, 'daySessions', 'ds1'))));
await t('OT canNOT read the exec roster', assertFails(getDocs(query(collection(ot, 'users'), where('role', 'in', ['salesExecutive'])))));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
if (fail) process.exit(1);
