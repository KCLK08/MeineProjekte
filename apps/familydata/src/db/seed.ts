import type { IdentificationData, Person } from '@/types/models';

type SeedMember = {
  person: Person;
  identification: IdentificationData;
};

const ts = '2026-01-15T10:00:00.000Z';

/** Fiction-only demo family. Not based on real people. Documents are user-uploaded only. */
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
  },
];
