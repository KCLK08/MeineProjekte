export type FamilyRole = 'vater' | 'mutter' | 'kind' | 'sonstiges';

export type Person = {
  id: string;
  vorname: string;
  nachname: string;
  rolle: FamilyRole | '';
  geburtsdatum: string;
  nationalitaet: string;
  telefon: string;
  email: string;
  adresse: string;
  notizen: string;
  createdAt: string;
  updatedAt: string;
};

export type IdEntry = {
  id: string;
  personId: string;
  label: string;
  value: string;
  sortOrder: number;
};

export type FamilyDocument = {
  id: string;
  name: string;
  personIds: string[];
  documentNumber: string;
  expiryDate: string;
  filePath: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SecuritySettings = {
  pinEnabled: boolean;
  biometricsEnabled: boolean;
  encryptionReady: boolean;
};

export type PersonWithDetails = Person & {
  idEntries: IdEntry[];
  documentCount: number;
};

export const FAMILY_ROLE_OPTIONS: { id: FamilyRole; label: string }[] = [
  { id: 'vater', label: 'Vater' },
  { id: 'mutter', label: 'Mutter' },
  { id: 'kind', label: 'Kind' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

export const ID_FIELD_SUGGESTIONS = [
  'Reisepass',
  'Personalausweis',
  'Aufenthaltstitel',
  'Führerschein',
  'Steuer-ID',
  'Krankenversicherung',
  'Kindergeld',
  'Geburtsurkunde',
];
