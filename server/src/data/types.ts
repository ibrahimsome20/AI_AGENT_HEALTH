export type Specialty =
  | "cardiology"
  | "emergency_medicine"
  | "internal_medicine"
  | "neurology"
  | "oncology"
  | "orthopedics"
  | "pulmonology";

export type FacilityType = "hospital" | "clinic" | "telehealth";

export interface Provider {
  id: string;
  name: string;
  nameAr: string;
  type: FacilityType;
  specialties: Specialty[];
  city: string;
  cityAr?: string;
  acceptsSecondOpinions: boolean;
  emergencyDepartment: boolean;
  languages: Array<"en" | "ar">;
  nextAvailable: string;
  nextAvailableAr?: string;
  notes: string;
  notesAr?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}
