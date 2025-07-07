export interface MentionedMaterial {
  id: string;
  displayName: string;
  type: 'file' | 'folder';
  originalName: string;
}

export interface ChatReference {
  id: string;
  text: string;
}

export interface ReferenceTag {
  id: string;
  text: string;
}

export interface StudyMaterial {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path?: string[];
}
