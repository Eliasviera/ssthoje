import "server-only";

export type PgrPdfImportRisk = {
  id: string;
  activity: string;
  hazard: string;
  sourceCircumstance?: string;
  possibleHarm?: string;
  existingMeasures: string[];
  // Employee/worker data when importing from RH
  registration?: string;
  name?: string;
  role?: string;
  function?: string;
  department?: string;
  sector?: string;
  admissionDate?: string;
  raw?: Record<string, string>;
};

export type PgrPdfImportResult = {
  fileId: string;
  fileName: string;
  company: {
    tradeName?: string;
    legalName?: string;
    cnpj?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  unit: {
    name?: string;
  };
  inventory: {
    title: string;
    revision: string;
  };
  risks: PgrPdfImportRisk[];
  notices?: string[];
  // When importing employee list
  workers?: Array<{
    id: string;
    registration?: string;
    name?: string;
    role?: string;
    function?: string;
    department?: string;
    sector?: string;
    admissionDate?: string;
    raw: Record<string, string>;
  }>;
};
