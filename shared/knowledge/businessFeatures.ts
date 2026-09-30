/**
 * APPROVED business-type → Vyapar Desktop feature mapping (M2D Conversation SOP, 2026-09-30).
 *
 * The agent may ONLY recommend features listed for the customer's business type. `example` is
 * the SOP's approved recommendation message (used verbatim when the AI is unavailable).
 * `match` = words customers use for that business (Hinglish/English/Hindi). Order matters:
 * specific categories are checked before the generic retail one.
 */

export interface BusinessCategory {
  key: string;
  label: string; // English
  labelHi: string; // as used in Hinglish sentences
  match: RegExp;
  features: string[];
  example: string | null; // approved Hinglish recommendation (ends with the device question)
}

export const DEVICE_QUESTION_HI = 'Aapke paas desktop ya laptop hai kya?';
export const DEVICE_QUESTION_EN = 'Do you have a desktop or laptop?';

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    key: 'mobile_shop',
    label: 'Mobile shop',
    labelHi: 'Mobile shop',
    match: /\bmobile\s*(shop|store|dukan|ki dukan|accessor\w*|repair|gallery|center|centre)\b|\bphone\s*(shop|store|dukan)\b|मोबाइल\s*(शॉप|की दुकान|स्टोर)/i,
    features: ['Serial Number Tracking', 'My Online Store', 'Batch Tracking', 'Multiple Billing', 'Barcode Scanning', 'Show Profit', 'Quick Entry', 'Credit Limit', 'Payment Reminder', 'Item Serial Report', 'Batch Tracking Report', 'Calculate Sale Price from MRP & Discount', 'Due Dates and Payment Terms'],
    example: 'Mobile shop ke liye Vyapar ke desktop version mein aap serial number-wise stock aur serial number report manage kar sakte ho. Barcode scanning aur multiple billing bhi kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'cctv',
    label: 'CCTV sales / service',
    labelHi: 'CCTV',
    match: /\bcctv\b|\bsecurity camera|\bcamera\s*(shop|business|dukan)|सीसीटीवी/i,
    features: ['Serial Number Tracking', 'My Online Store', 'E-way Bill', 'Barcode Scanning', 'Stock Management'],
    example: 'CCTV business ke liye Vyapar ke desktop version mein aap serial number ke hisaab se stock track kar sakte ho, barcode scanning aur stock management kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'solar',
    label: 'Solar panel',
    labelHi: 'Solar panel',
    match: /\bsolar\b|सोलर/i,
    features: ['Manufacturing / BOM', 'My Online Store', 'Stock maintenance of parts', 'E-way Bill'],
    example: 'Solar panel business ke liye Vyapar ke desktop version mein aap BOM ke through manufacturing manage kar sakte ho aur solar panel banane mein use hone wale parts ka stock maintain kar sakte ho. E-way bill bhi manage kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'pharmacy',
    label: 'Medical shop / Pharmacy',
    labelHi: 'Medical shop',
    match: /\b(medical|pharma\w*|chemist|druggist|medicine|dawa|dawai|dawaai)\b|मेडिकल|दवा|दवाई|फार्मेसी/i,
    features: ['My Online Store', 'Batch Tracking', 'Expiry date', 'Manufacturing date', 'Batch number', 'Multiple Billing', 'Barcode Scanning', 'Show Profit', 'Quick Entry', 'Credit Limit', 'Payment Reminder', 'Batch Tracking Report', 'Calculate Sale Price from MRP & Discount'],
    example: 'Medical shop ke liye Vyapar ke desktop version mein aap batch number, expiry date aur manufacturing date ke hisaab se stock track kar sakte ho. Batch tracking report, barcode scanning aur multiple billing bhi use kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'dairy',
    label: 'Dairy',
    labelHi: 'Dairy',
    match: /\b(dairy|milk|doodh|dudh)\b|डेयरी|दूध/i,
    features: ['One-day sold-out stock', 'Remaining stock', 'My Online Store', 'Batch tracking', 'Expiry date', 'Manufacturing date', 'Payment Reminder', 'Payment Link'],
    example: 'Dairy business ke liye Vyapar ke desktop version mein aap sold-out aur remaining stock ko manage kar sakte ho aur expiry/manufacturing date ke hisaab se batch track kar sakte ho. Payment reminder aur payment link bhi use kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'salon',
    label: 'Salon',
    labelHi: 'Salon',
    match: /\b(salon|saloon|parlou?r|beauty|barber|spa)\b|सैलून|पार्लर/i,
    features: ['My Online Store', 'Multi Billing', 'Payment Link'],
    example: 'Salon business ke liye Vyapar ke desktop version mein aap multiple billing kar sakte ho aur My Online Store ke through apne business ko promote kar sakte ho. Payment link bhi share kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'restaurant',
    label: 'Restaurant',
    labelHi: 'Restaurant',
    match: /\b(restaurant|resturant|hotel|dhaba|cafe|café|canteen|catering|caterer|bakery|sweet\s*shop|mithai|fast\s*food|food)\b|रेस्टोरेंट|ढाबा|होटल/i,
    features: ['My Online Store', 'Multiple Billing', 'Manufacturing feature for raw stock', 'Low Stock Alert', 'Stock Maintenance', 'Payment Link', 'QR Menu through My Online Store'],
    example: 'Restaurant business ke liye Vyapar ke desktop version mein aap raw material ka stock maintain kar sakte ho, low stock alert dekh sakte ho aur multiple billing kar sakte ho. My Online Store ke through QR menu bhi bana sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'clothing',
    label: 'Clothing',
    labelHi: 'Clothing',
    match: /\b(cloth\w*|garment\w*|kapd[ae]|kapde|saree|sari|fashion|boutique|textile\w*|readymade|footwear|shoes?)\b|कपड़|कपड़े|साड़ी|गारमेंट/i,
    features: ['Multiple billing', 'Barcode generation', 'Barcode scanning', 'Show Profit', 'My Online Store', 'Quick Entry', 'Credit limit', 'Payment reminder', 'Bulk Update Items', 'Low Stock', 'Retail and wholesale price', 'Calculate Sale Price from MRP & Discount', 'Size/colour-wise stock tracking', 'Due Dates and Payment Terms'],
    example: 'Clothing business ke liye Vyapar ke desktop version mein aap size aur colour ke hisaab se stock track kar sakte ho. Barcode scanning, multiple billing aur low stock jaise features bhi use kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'electronics',
    label: 'Electronics',
    labelHi: 'Electronics',
    match: /\b(electronic\w*|electrical\w*|appliance\w*|computer\s*shop|laptop\s*shop)\b|इलेक्ट्रॉनिक|इलेक्ट्रिकल/i,
    features: ['Serial Number Tracking', 'Serial Number-wise Stock Report', 'Batch Tracking', 'Batch Tracking Report', 'Barcode Scanning', 'Barcode Generation', 'My Online Store', 'Low Stock Report', 'Multiple Billing', 'Bulk Item Update', 'Show Profit'],
    example: 'Electronics business ke liye Vyapar ke desktop version mein aap serial number-wise stock aur report manage kar sakte ho. Barcode scanning, multiple billing aur low stock report bhi use kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'construction',
    label: 'Construction',
    labelHi: 'Construction',
    match: /\b(construction|contractor|builder\w*|civil work|real estate|interior\w*)\b|कंस्ट्रक्शन|ठेकेदार/i,
    features: ['Raw Material / BOM', 'Total Estimate Cost', 'Bill-wise Profit', 'E-way Bill', 'Stock Maintenance', 'Low Stock Alert'],
    example: 'Construction business ke liye Vyapar ke desktop version mein aap raw material aur BOM manage kar sakte ho, estimate cost dekh sakte ho aur bill-wise profit track kar sakte ho. Stock maintenance aur low stock alert bhi available hai. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'agriculture',
    label: 'Agriculture',
    labelHi: 'Agriculture',
    match: /\b(agri\w*|farm\w*|kheti|fertili[sz]er\w*|khad|beej|seeds?|pesticide\w*|krishi|tractor)\b|कृषि|खाद|बीज|खेती/i,
    features: ['Stock Maintenance', 'My Online Store', 'Low Stock Alert', 'Show Profit while making Sale Bill', 'Bill-wise Profit', 'Estimate', 'Calculate Sale Price from MRP & Discount'],
    example: 'Agriculture business ke liye Vyapar ke desktop version mein aap stock maintain kar sakte ho, low stock alert dekh sakte ho aur sale bill banate waqt profit bhi dekh sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    labelHi: 'Manufacturing',
    match: /\b(manufactur\w*|factory|production|fabricat\w*|industr\w*)\b|फैक्ट्री|उत्पादन|मैन्युफैक्चर/i,
    features: ['Manufacturing stock maintenance', 'BOM', 'Manufacturing report', 'Consumption report', 'Barcode generation', 'Barcode scanning', 'Stock tracking by serial number', 'Expiry date tracking', 'Manufacturing date tracking', 'Batch number tracking', 'E-way bill, if required', 'My Online Store'],
    example: 'Manufacturing business ke liye Vyapar ke desktop version mein aap badi screen par BOM, manufacturing report aur consumption report jaise features use kar sakte ho. Stock ko batch, serial number, expiry date aur manufacturing date ke hisaab se bhi track kar sakte ho. Aapke paas desktop ya laptop hai kya?',
  },
  {
    key: 'tour_travel',
    label: 'Tour & Travel',
    labelHi: 'Tour & Travel',
    match: /\b(tour\w*|travel\w*|taxi|cab|transport\w*|tourism)\b|ट्रैवल|टूर/i,
    features: [], // SOP: no specific features — do not invent any
    example: null,
  },
  {
    key: 'retail',
    label: 'Grocery / Kirana / Retail / Wholesale / Trading',
    labelHi: 'Kirana',
    match: /\b(kirana|kiryana|grocery|groceries|supermarket|super market|general\s*store|provision\w*|retail\w*|wholesale\w*|wholeseller|distribut\w*|trading|trader\w*|stationery|hardware|dukan|dukaan|shop|store|mart)\b|किराना|दुकान|जनरल स्टोर|होलसेल|ट्रेडिंग/i,
    features: ['Multiple billing at a time', 'Barcode scanning', 'Show Profit while making Sale Invoice', 'My Online Store', 'Quick Entry', 'Credit limit of party', 'Payment reminder', 'Bulk Update Items', 'Low Stock Report', 'Retail and wholesale price', 'Calculate Sale Price from MRP & Discount', 'Due Dates and Payment Terms'],
    example: 'Kirana business ke liye Vyapar ke desktop version mein aap badi screen par multiple billing, barcode scanning aur sale bill banate waqt profit dekhne jaise features use kar sakte ho. Low stock report aur payment reminder bhi kaafi useful hain. Aapke paas desktop ya laptop hai kya?',
  },
];

/** First category whose words appear in the text (specific categories before generic retail). */
export function detectBusiness(text: string): BusinessCategory | null {
  return BUSINESS_CATEGORIES.find((c) => c.match.test(text)) ?? null;
}

export const businessByKey = (key: string | null | undefined) => BUSINESS_CATEGORIES.find((c) => c.key === key) ?? null;
