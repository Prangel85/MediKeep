/**
 * API calls for appointments, prescriptions and payments.
 *
 * Kept outside services/api/index.js to keep the feature self-contained;
 * it reuses the shared ApiService transport (auth, base URL, errors).
 */
import { apiService } from './index';

const withPatient = (path, patientId) =>
  patientId !== null && patientId !== undefined
    ? `${path}${path.includes('?') ? '&' : '?'}patient_id=${patientId}`
    : path;

const crud = base => ({
  getAll: signal => apiService.get(`/${base}/`, { signal }),
  getByPatient: (patientId, signal) =>
    apiService.get(withPatient(`/${base}/`, patientId), { signal }),
  get: (id, signal) => apiService.get(`/${base}/${id}`, { signal }),
  create: (data, signal) => apiService.post(`/${base}/`, data, { signal }),
  update: (id, data, signal) => apiService.put(`/${base}/${id}`, data, { signal }),
  delete: (id, signal) => apiService.delete(`/${base}/${id}`, { signal }),
});

export const appointmentApi = {
  ...crud('appointments'),
  getUpcoming: (patientId, days = 30, signal) =>
    apiService.get(withPatient(`/appointments/upcoming?days=${days}`, patientId), {
      signal,
    }),
  complete: (id, body = {}, signal) =>
    apiService.post(`/appointments/${id}/complete`, body, { signal }),
};

export const prescriptionApi = {
  ...crud('prescriptions'),
  getExpiring: (patientId, days = 30, signal) =>
    apiService.get(withPatient(`/prescriptions/expiring?days=${days}`, patientId), {
      signal,
    }),
};

export const paymentApi = {
  ...crud('payments'),
  getDue: (patientId, days = 30, signal) =>
    apiService.get(withPatient(`/payments/due?days=${days}`, patientId), { signal }),
  getSummary: (patientId, year = null, signal) =>
    apiService.get(
      withPatient(`/payments/summary${year ? `?year=${year}` : ''}`, patientId),
      { signal }
    ),
};
