import { create } from 'zustand';

import * as repo from '@/db/repository';
import type { DocumentListRow } from '@/db/repository';
import { DUMMY_FAMILY } from '@/db/seed';
import type { FamilyDocument, IdentificationData, Person } from '@/types/models';

const BOOTSTRAP_TIMEOUT_MS = 6_000;

function memorySeed() {
  const people = DUMMY_FAMILY.map((m) => m.person);
  const documents: DocumentListRow[] = [];
  return { people, documents };
}

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
  people: Person[];
  documents: DocumentListRow[];
  bootstrap: () => Promise<void>;
  refreshPeople: () => Promise<void>;
  refreshDocuments: (filters?: { personId?: string; query?: string }) => Promise<void>;
  savePerson: (
    person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    identification: Omit<IdentificationData, 'personId'>
  ) => Promise<string>;
  removePerson: (id: string) => Promise<void>;
  saveDocument: (doc: Omit<FamilyDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
};

let bootstrapInFlight: Promise<void> | null = null;

export const useFamilyStore = create<FamilyState>((set, get) => ({
  ready: false,
  loading: false,
  error: '',
  people: [],
  documents: [],

  bootstrap: async () => {
    if (bootstrapInFlight) return bootstrapInFlight;

    // Show screens immediately with dummy seed – never block UI on SQLite.
    const seed = memorySeed();
    set({
      ...seed,
      ready: true,
      loading: true,
      error: '',
    });

    bootstrapInFlight = (async () => {
      try {
        await withTimeout(
          (async () => {
            await get().refreshPeople();
            await get().refreshDocuments();
          })(),
          BOOTSTRAP_TIMEOUT_MS,
          'SQLite antwortet nicht – App läuft mit Demo-Daten.'
        );
        set({ error: '' });
      } catch (e) {
        // Keep memory seed so the app remains usable in Expo Go.
        set({
          error: (e as Error).message || 'Datenbank nicht erreichbar – Demo-Daten aktiv.',
        });
      } finally {
        set({ loading: false, ready: true });
        bootstrapInFlight = null;
      }
    })();

    return bootstrapInFlight;
  },

  refreshPeople: async () => {
    set({ people: await repo.listPeople() });
  },

  refreshDocuments: async (filters) => {
    set({ documents: await repo.listDocuments(filters) });
  },

  savePerson: async (person, identification) => {
    const id = await repo.upsertPerson(person, identification);
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
