export type Person = {
  id: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  nationalitaet: string;
  telefon: string;
  email: string;
  adresse: string;
  notizen: string;
  createdAt: string;
  updatedAt: string;
};

export type IdentificationData = {
  personId: string;
  reisepassnummer: string;
  personalausweisnummer: string;
  aufenthaltstitelnummer: string;
  fuehrerscheinnummer: string;
  steuerId: string;
  krankenkassenNummer: string;
  kindergeldNummer: string;
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
  identification: IdentificationData;
  documentCount: number;
};
