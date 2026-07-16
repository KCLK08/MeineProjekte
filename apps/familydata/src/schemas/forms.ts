import { z } from 'zod';

const optionalText = z.string().trim().optional().or(z.literal(''));

export const personFormSchema = z.object({
  vorname: z.string().trim().min(1, 'Vorname ist erforderlich'),
  nachname: z.string().trim().min(1, 'Nachname ist erforderlich'),
  geburtsdatum: optionalText,
  nationalitaet: optionalText,
  telefon: optionalText,
  email: z.string().trim().email('Ungültige E-Mail').optional().or(z.literal('')),
  adresse: optionalText,
  notizen: optionalText,
  reisepassnummer: optionalText,
  personalausweisnummer: optionalText,
  aufenthaltstitelnummer: optionalText,
  fuehrerscheinnummer: optionalText,
  steuerId: optionalText,
  krankenkassenNummer: optionalText,
  kindergeldNummer: optionalText,
});

export type PersonFormValues = z.infer<typeof personFormSchema>;

export const documentFormSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich'),
  personIds: z.array(z.string()).min(1, 'Mindestens eine Person wählen'),
  documentNumber: optionalText,
  expiryDate: optionalText,
  notes: optionalText,
  filePath: z.string().trim().min(1, 'Datei ist erforderlich'),
});

export type DocumentFormValues = z.infer<typeof documentFormSchema>;
