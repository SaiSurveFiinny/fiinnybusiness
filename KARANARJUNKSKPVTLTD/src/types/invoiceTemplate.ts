// Invoice Template Types

export type InvoiceTemplateType = 'distributor_retailer' | 'retailer_customer';

export interface InvoiceField {
    id: string;           // unique id
    label: string;        // display label on invoice
    sourceKey: string;    // key to look up in data object (order/retailer)
    show: boolean;        // whether this field appears on invoice
    bold: boolean;        // render label/value bold
    order: number;
    isCurrency?: boolean; // format as ₹ amount
    systemOnly?: boolean; // cannot be deleted
}

export interface InvoiceTemplateBranding {
    businessName: string;
    address: string;
    gstin?: string;
    /** @deprecated use fertilizerLicense / pesticideLicense / seedsLicense */
    licenseNumbers?: string;
    fertilizerLicense?: string;
    pesticideLicense?: string;
    seedsLicense?: string;
    logoUrl?: string;
    bankDetails?: string;
    signatureName?: string;
    signatureUrl?: string;
    terms?: string;
    contact?: string;
    email?: string;
    upiId?: string;
    razorpayKeyId?: string;
    thermalHeader?: string;
    thermalFooter?: string;
    // Presentation-only invoice text-case preference — consumed by
    // PosInvoicePreview's up() helper. Undefined (existing tenants) behaves
    // as 'normal'. Never affects stored customer/product/order data.
    invoiceTextCase?: 'normal' | 'uppercase';
}

export interface InvoiceTemplate {
    templateId: InvoiceTemplateType;
    name: string;
    description: string;
    fields: InvoiceField[];
    updatedAt?: any;
}
