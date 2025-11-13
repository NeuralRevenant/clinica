export interface Coding {
  system: string;
  code: string;
  display: string;
}

export interface CodeableConcept {
  coding: Coding[];
}
