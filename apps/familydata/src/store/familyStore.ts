import { create } from 'zustand';

import * as repo from '@/db/repository';
import type { DocumentListRow } from '@/db/repository';
import type { FamilyDocument, FamilyRole, Person } from '@/types/models';

const BOOTSTRAP_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

type FamilyState = {
  ready: boolean;
  loading: boolean;
  error: string;
  setupComplete: boolean;
  familyName: string;
  people: Person[];
  documents: DocumentListRow[];
  bootstrap: () => Promise<void>;
  refreshFamilyMeta: () => Promise<void>;
  refreshPeople: () => Promise<void>;
  refreshDocuments: (filters?: { personId?: string; query?: string }) => Promise<void>;
  completeSetup: (input: {
    familyName: string;
    members: Array<{
      vorname: string;
      nachname: string;
      rolle: FamilyRole;
      geburtsdatum?: string;
    }>;
  }) => Promise<void>;
  savePerson: (person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  removePerson: (id: string) => Promise<void>;
  saveDocument: (doc: Omit<FamilyDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
};

let bootstrapInFlight: Promise<void> | null = null;

export const useFamilyStore = create<FamilyState>((set, get) => ({
  ready: false,
  loading: false,
  error: '',
  setupComplete: false,
  familyName: '',
  people: [],
  documents: [],

  bootstrap: async () => {
    if (bootstrapInFlight) return bootstrapInFlight;

    set({
      ready: true,
      loading: true,
      error: '',
      people: [],
      documents: [],
    });

    bootstrapInFlight = (async () => {
      try {
        await withTimeout(
          (async () => {
            await get().refreshFamilyMeta();
            await get().refreshPeople();
            await get().refreshDocuments();
          })(),
          BOOTSTRAP_TIMEOUT_MS,
          'SQLite antwortet nicht.'
        );
        set({ error: '' });
      } catch (e) {
        set({
          error: (e as Error).message || 'Datenbank nicht erreichbar.',
        });
      } finally {
        set({ loading: false, ready: true });
        bootstrapInFlight = null;
      }
    })();

    return bootstrapInFlight;
  },

  refreshFamilyMeta: async () => {
    const [familyName, setupComplete] = await Promise.all([repo.getFamilyName(), repo.isSetupComplete()]);
    set({ familyName, setupComplete });
  },

  refreshPeople: async () => {
    set({ people: await repo.listPeople() });
  },

  refreshDocuments: async (filters) => {
    set({ documents: await repo.listDocuments(filters) });
  },

  completeSetup: async (input) => {
    await repo.completeFamilySetup(input);
    await get().refreshFamilyMeta();
    await get().refreshPeople();
  },

  savePerson: async (person) => {
    const id = await repo.upsertPerson(person);
    await get().refreshPeople();
    await get().refreshDocuments();
    return id;
  },

  removePerson: async (id) => {
    await repo.deletePerson(id);
    await get().refreshPeople();
    await get().refreshDocuments();
  },

  saveDocument: async (doc) => {
    const id = await repo.upsertDocument(doc);
    await get().refreshDocuments();
    return id;
  },

  removeDocument: async (id) => {
    await repo.deleteDocument(id);
    await get().refreshDocuments();
  },
}));
