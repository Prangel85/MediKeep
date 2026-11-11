// Option lists for appointments, prescriptions and payments.
// Values must match the enums in app/models/scheduling.py.

const option = (value, labelKey, fallback, color) => ({
  value,
  labelKey,
  fallback,
  color,
});

export const APPOINTMENT_STATUSES = [
  option('scheduled', 'scheduling.appointmentStatus.scheduled', 'Scheduled', 'blue'),
  option('confirmed', 'scheduling.appointmentStatus.confirmed', 'Confirmed', 'teal'),
  option('completed', 'scheduling.appointmentStatus.completed', 'Completed', 'green'),
  option('cancelled', 'scheduling.appointmentStatus.cancelled', 'Cancelled', 'gray'),
];

export const APPOINTMENT_TYPES = [
  option('visit', 'scheduling.appointmentType.visit', 'Visit', 'blue'),
  option('follow_up', 'scheduling.appointmentType.follow_up', 'Follow-up', 'cyan'),
  option('exam', 'scheduling.appointmentType.exam', 'Diagnostic exam', 'violet'),
  option('lab_test', 'scheduling.appointmentType.lab_test', 'Lab test', 'grape'),
  option('procedure', 'scheduling.appointmentType.procedure', 'Procedure', 'orange'),
  option('therapy', 'scheduling.appointmentType.therapy', 'Therapy session', 'teal'),
  option('vaccination', 'scheduling.appointmentType.vaccination', 'Vaccination', 'lime'),
  option('telehealth', 'scheduling.appointmentType.telehealth', 'Telehealth', 'indigo'),
  option('other', 'scheduling.appointmentType.other', 'Other', 'gray'),
];

export const PRESCRIPTION_STATUSES = [
  option('active', 'scheduling.prescriptionStatus.active', 'Not used yet', 'blue'),
  option('used', 'scheduling.prescriptionStatus.used', 'Used', 'green'),
  option('expired', 'scheduling.prescriptionStatus.expired', 'Expired', 'red'),
  option('cancelled', 'scheduling.prescriptionStatus.cancelled', 'Cancelled', 'gray'),
];

export const PRESCRIPTION_TYPES = [
  option('medication', 'scheduling.prescriptionType.medication', 'Medication', 'blue'),
  option('exam', 'scheduling.prescriptionType.exam', 'Exam / lab test', 'violet'),
  option('referral', 'scheduling.prescriptionType.referral', 'Specialist referral', 'cyan'),
  option('therapy', 'scheduling.prescriptionType.therapy', 'Therapy', 'teal'),
  option('device', 'scheduling.prescriptionType.device', 'Medical device', 'orange'),
  option('other', 'scheduling.prescriptionType.other', 'Other', 'gray'),
];

export const PAYMENT_STATUSES = [
  option('due', 'scheduling.paymentStatus.due', 'To pay', 'orange'),
  option('paid', 'scheduling.paymentStatus.paid', 'Paid', 'green'),
  option('cancelled', 'scheduling.paymentStatus.cancelled', 'Cancelled', 'gray'),
];

export const PAYMENT_TYPES = [
  option('copay', 'scheduling.paymentType.copay', 'Copay', 'blue'),
  option('private', 'scheduling.paymentType.private', 'Private', 'violet'),
  option('intramural', 'scheduling.paymentType.intramural', 'Private in public facility', 'grape'),
  option('insurance', 'scheduling.paymentType.insurance', 'Insurance', 'cyan'),
  option('pharmacy', 'scheduling.paymentType.pharmacy', 'Pharmacy', 'teal'),
  option('other', 'scheduling.paymentType.other', 'Other', 'gray'),
];

export const PAYMENT_METHODS = [
  option('cash', 'scheduling.paymentMethod.cash', 'Cash'),
  option('card', 'scheduling.paymentMethod.card', 'Card'),
  option('bank_transfer', 'scheduling.paymentMethod.bank_transfer', 'Bank transfer'),
  option('online', 'scheduling.paymentMethod.online', 'Online'),
  option('other', 'scheduling.paymentMethod.other', 'Other'),
];

// Optional suggestions for the free-text priority field. They are the
// Italian NHS priority classes; the field accepts any value, so other
// systems can simply type their own. Labels come from translations.
export const PRIORITY_SUGGESTIONS = [
  option('U', 'scheduling.priority.U', 'U - Urgent (within 72 hours)'),
  option('B', 'scheduling.priority.B', 'B - Short (within 10 days)'),
  option('D', 'scheduling.priority.D', 'D - Deferrable (30 days visits / 60 days exams)'),
  option('P', 'scheduling.priority.P', 'P - Planned (within 120 days)'),
];

// Reminder presets. Defaults mirror app/models/scheduling.py.
export const APPOINTMENT_REMINDER_PRESETS = [10080, 4320, 1440, 720, 120, 60, 30];
export const DEFAULT_APPOINTMENT_REMINDERS = [10080, 1440, 120];
export const DAY_REMINDER_PRESETS = [30, 14, 7, 3, 2, 1];
export const DEFAULT_PRESCRIPTION_REMINDER_DAYS = [7, 1];
export const DEFAULT_PAYMENT_REMINDER_DAYS = [3, 1];

export const DEFAULT_CURRENCY = 'EUR';
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'PLN', 'SEK'];

export const toSelectOptions = (options, t) =>
  options.map(o => ({ value: o.value, label: t(o.labelKey, o.fallback) }));

export const findOption = (options, value) =>
  options.find(o => o.value === value) || null;

export const getOptionLabel = (options, value, t) => {
  const found = findOption(options, value);
  return found ? t(found.labelKey, found.fallback) : value || '';
};

export const getOptionColor = (options, value) =>
  findOption(options, value)?.color || 'gray';
