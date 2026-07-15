import { create } from 'zustand';

import * as repo from '@/db/repository';
import type { DocumentType, FamilyDocument, IdentificationData, Person } from '@/types/models';

type DocRow = FamilyDocument & { personName: string; typeName: string; expiryDateRelevant: number };

type FamilyState = {
  ready: boolean;
  loading: boolean;
  error: string;
  people: Person[];
  documentTypes: DocumentType[];
  documents: DocRow[];
  bootstrap: () => Promise<void>;
  refreshPeople: () => Promise<void>;
  refreshDocuments: (filters?: { personId?: string; documentTypeId?: string; query?: string }) => Promise<void>;
  refreshDocumentTypes: () => Promise<void>;
  savePerson: (
    person: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    identification: Omit<IdentificationData, 'personId'>
  ) => Promise<string>;
  removePerson: (id: string) => Promise<void>;
  saveDocument: (doc: Omit<FamilyDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
  addDocumentType: (name: string, expiryDateRelevant: boolean) => Promise<void>;
  removeDocumentType: (id: string) => Promise<void>;
};

export const useFamilyStore = create<FamilyState>((set, get) => ({
  ready: false,
  loading: false,
  error: '',
  people: [],
  documentTypes: [],
  documents: [],

  bootstrap: async () => {
    set({ loading: true, error: '' });
    try {
      await get().refreshPeople();
      await get().refreshDocumentTypes();
      await get().refreshDocuments();
      set({ ready: true });
    } catch (e) {
      set({ error: (e as Error).message || 'Datenbankfehler' });
    } finally {
      set({ loading: false });
    }
  },

  refreshPeople: async () => {
    set({ people: await repo.listPeople() });
  },

  refreshDocuments: async (filters) => {
    set({ documents: await repo.listDocuments(filters) });
  },

  refreshDocumentTypes: async () => {
    set({ documentTypes: await repo.listDocumentTypes() });
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

  addDocumentType: async (name, expiryDateRelevant) => {
    await repo.createDocumentType(name, expiryDateRelevant);
    await get().refreshDocumentTypes();
  },

  removeDocumentType: async (id) => {
    await repo.deleteDocumentType(id);
    await get().refreshDocumentTypes();
  },
}));
