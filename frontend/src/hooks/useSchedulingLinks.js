import { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { appointmentApi, prescriptionApi } from '../services/api/schedulingApi';
import logger from '../services/logger';

const LOADERS = {
  appointments: (patientId, signal) => appointmentApi.getByPatient(patientId, signal),
  prescriptions: (patientId, signal) => prescriptionApi.getByPatient(patientId, signal),
  medications: (patientId, signal) => apiService.getPatientMedications(patientId, signal),
};

/**
 * Loads the records a prescription or payment can be linked to.
 *
 * @param {number|null} patientId
 * @param {string[]} kinds - any of 'appointments', 'prescriptions', 'medications'
 * @param {boolean} enabled - load only while a form is open
 * @returns {{appointments: Array, prescriptions: Array, medications: Array}}
 */
export const useSchedulingLinks = (patientId, kinds, enabled = true) => {
  const [links, setLinks] = useState({ appointments: [], prescriptions: [], medications: [] });
  const kindsKey = kinds.join(',');

  useEffect(() => {
    if (!patientId || !enabled) return undefined;
    const controller = new AbortController();
    kindsKey
      .split(',')
      .filter(kind => LOADERS[kind])
      .forEach(kind => {
        LOADERS[kind](patientId, controller.signal)
          .then(data =>
            setLinks(prev => ({ ...prev, [kind]: Array.isArray(data) ? data : [] }))
          )
          .catch(err => {
            if (err?.name === 'AbortError') return;
            logger.error('scheduling_links_load_error', {
              message: 'Failed to load link options',
              kind,
              error: err?.message,
              component: 'useSchedulingLinks',
            });
          });
      });
    return () => controller.abort();
  }, [patientId, kindsKey, enabled]);

  return links;
};

export default useSchedulingLinks;
