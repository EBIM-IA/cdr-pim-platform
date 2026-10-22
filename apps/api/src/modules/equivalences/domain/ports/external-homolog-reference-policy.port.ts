/** The same catalogue identity rule is used by manual edits and staged imports. */
export interface ExternalHomologReferencePolicyPort {
  assertExternalReference(externalCode: string, externalBrand: string): Promise<void>;
}

export const EXTERNAL_HOMOLOG_REFERENCE_POLICY = Symbol('ExternalHomologReferencePolicyPort');
