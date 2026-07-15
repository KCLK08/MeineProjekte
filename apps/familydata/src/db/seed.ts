import type { DocumentType, FamilyDocument, IdentificationData, Person } from '@/types/models';

/** Built-in document types (dummy catalog, no real docs). */
export const DEFAULT_DOCUMENT_TYPES: Omit<DocumentType, 'isSystem'>[] = [
  { id: 'dtype_reisepass', name: 'Reisepass', expiryDateRelevant: true },
  { id: 'dtype_personalausweis', name: 'Personalausweis', expiryDateRelevant: true },
  { id: 'dtype_aufenthaltstitel', name: 'Aufenthaltstitel', expiryDateRelevant: true },
  { id: 'dtype_krankenkasse', name: 'Krankenkassenkarte', expiryDateRelevant: false },
  { id: 'dtype_geburtsurkunde', name: 'Geburtsurkunde', expiryDateRelevant: false },
  { id: 'dtype_zeugnisse', name: 'Zeugnisse', expiryDateRelevant: false },
  { id: 'dtype_steueridentifikation', name: 'Steueridentifikation', expiryDateRelevant: false },
  { id: 'dtype_fuehrerschein', name: 'Führerschein', expiryDateRelevant: true },
  { id: 'dtype_kindergeld', name: 'Kindergeldbescheinigung', expiryDateRelevant: false },
  { id: 'dtype_sonstiges', name: 'Sonstiges', expiryDateRelevant: false },
];

type SeedMember = {
  person: Person;
  identification: IdentificationData;
  documents: FamilyDocument[];
};

const ts = '2026-01-15T10:00:00.000Z';

/** Fiction-only demo family. Not based on real people. */
export const DUMMY_FAMILY: SeedMember[] = [
  {
    person: {
      id: 'person_vater',
      vorname: 'Max',
      nachname: 'Muster',
      geburtsdatum: '1980-03-12',
      nationalitaet: 'deutsch',
      telefon: '+49 170 0000001',
      email: 'max.muster@example.com',
      adresse: 'Musterstraße 1, 10115 Berlin',
      notizen: 'Dummy-Vater (Testdaten)',
      createdAt: ts,
      updatedAt: ts,
    },
    identification: {
      personId: 'person_vater',
      reisepassnummer: 'C01X00T00',
      personalausweisnummer: 'L01X00T00',
      aufenthaltstitelnummer: '',
      fuehrerscheinnummer: 'B070K0DUMMY',
      steuerId: '12 345 678 901',
      krankenkassenNummer: 'A123456789',
      kindergeldNummer: '',
    },
    documents: [
      {
        id: 'doc_vater_pass',
        personId: 'person_vater',
        documentTypeId: 'dtype_reisepass',
        documentNumber: 'C01X00T00',
        expiryDate: '2031-03-12',
        filePath: '',
        notes: 'Platzhalter – keine echte Datei',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  },
  {
    person: {
      id: 'person_mutter',
      vorname: 'Erika',
      nachname: 'Muster',
      geburtsdatum: '1982-07-04',
      nationalitaet: 'deutsch',
      telefon: '+49 170 0000002',
      email: 'erika.muster@example.com',
      adresse: 'Musterstraße 1, 10115 Berlin',
      notizen: 'Dummy-Mutter (Testdaten)',
      createdAt: ts,
      updatedAt: ts,
    },
    identification: {
      personId: 'person_mutter',
      reisepassnummer: '',
      personalausweisnummer: 'T22000129',
      aufenthaltstitelnummer: '',
      fuehrerscheinnummer: '',
      steuerId: '98 765 432 109',
      krankenkassenNummer: 'B987654321',
      kindergeldNummer: '',
    },
    documents: [
      {
        id: 'doc_mutter_ausweis',
        personId: 'person_mutter',
        documentTypeId: 'dtype_personalausweis',
        documentNumber: 'T22000129',
        expiryDate: '2029-07-04',
        filePath: '',
        notes: 'Platzhalter',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  },
  {
    person: {
      id: 'person_kind1',
      vorname: 'Leo',
      nachname: 'Muster',
      geburtsdatum: '2014-11-21',
      nationalitaet: 'deutsch',
      telefon: '',
      email: '',
      adresse: 'Musterstraße 1, 10115 Berlin',
      notizen: 'Dummy-Kind 1',
      createdAt: ts,
      updatedAt: ts,
    },
    identification: {
      personId: 'person_kind1',
      reisepassnummer: '',
      personalausweisnummer: '',
      aufenthaltstitelnummer: '',
      fuehrerscheinnummer: '',
      steuerId: '',
      krankenkassenNummer: 'C111222333',
      kindergeldNummer: 'KG-DUMMY-001',
    },
    documents: [
      {
        id: 'doc_kind1_geburt',
        personId: 'person_kind1',
        documentTypeId: 'dtype_geburtsurkunde',
        documentNumber: 'GU-2014-TEST',
        expiryDate: '',
        filePath: '',
        notes: 'Kein Ablaufdatum',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  },
  {
    person: {
      id: 'person_kind2',
      vorname: 'Mia',
      nachname: 'Muster',
      geburtsdatum: '2018-05-09',
      nationalitaet: 'deutsch',
      telefon: '',
      email: '',
      adresse: 'Musterstraße 1, 10115 Berlin',
      notizen: 'Dummy-Kind 2',
      createdAt: ts,
      updatedAt: ts,
    },
    identification: {
      personId: 'person_kind2',
      reisepassnummer: '',
      personalausweisnummer: '',
      aufenthaltstitelnummer: '',
      fuehrerscheinnummer: '',
      steuerId: '',
      krankenkassenNummer: 'D444555666',
      kindergeldNummer: 'KG-DUMMY-002',
    },
    documents: [
      {
        id: 'doc_kind2_kk',
        personId: 'person_kind2',
        documentTypeId: 'dtype_krankenkasse',
        documentNumber: 'KK-TEST-002',
        expiryDate: '',
        filePath: '',
        notes: 'Testdaten',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  },
];
