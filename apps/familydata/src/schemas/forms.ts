import { z } from 'zod';

import { parseDateDe } from '@/utils/helpers';

const optionalText = z.string().trim().optional().or(z.literal(''));

const optionalDateDe = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || Boolean(parseDateDe(v)), {
    message: 'Datum als TT.MM.JJJJ eingeben',
  });

export const personFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Name ist erforderlich'),
  rolle: z.union([z.enum(['vater', 'mutter', 'kind', 'sonstiges']), z.literal('')]),
  geburtsdatum: optionalDateDe,
  telefon: optionalText,
  email: z.string().trim().email('Ungültige E-Mail').optional().or(z.literal('')),
  adresse: optionalText,
});

export type PersonFormValues = z.infer<typeof personFormSchema>;

export const documentFormSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich'),
  personIds: z.array(z.string()).min(1, 'Mindestens eine Person wählen'),
  notes: optionalText,
  filePath: z.string().trim().min(1, 'Datei ist erforderlich'),
});

export type DocumentFormValues = z.infer<typeof documentFormSchema>;

export const familySetupSchema = z.object({
  familyName: z.string().trim().min(1, 'Familienname ist erforderlich'),
  members: z
    .array(
      z.object({
        fullName: z.string().trim().min(1, 'Name ist erforderlich'),
        rolle: z.enum(['vater', 'mutter', 'kind', 'sonstiges']),
        geburtsdatum: optionalDateDe,
      })
    )
    .min(1, 'Mindestens ein Familienmitglied anlegen'),
});

export type FamilySetupValues = z.infer<typeof familySetupSchema>;
