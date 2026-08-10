export const LOCATION_DATA: Record<string, string[]> = {
    Maharashtra: [
        'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad', 'Beed', 'Bhandara',
        'Buldhana', 'Chandrapur', 'Dhule', 'Gadchiroli', 'Gondia', 'Hingoli',
        'Jalgaon', 'Jalna', 'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban',
        'Nagpur', 'Nanded', 'Nandurbar', 'Nashik', 'Osmanabad', 'Palghar',
        'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara',
        'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal',
    ],
    // Add more states here — the UI requires no changes
};

export const STATES = Object.keys(LOCATION_DATA);
