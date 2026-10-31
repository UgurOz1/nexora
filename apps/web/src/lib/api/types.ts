import type { components } from './schema';

// Short names for the schemas the API publishes (see openapi.json). The shapes themselves are
// generated; nothing here is written by hand, so they cannot disagree with the API.
type Schemas = components['schemas'];

export type Role = Schemas['Role'];
export type Me = Schemas['MeResponseDto'];
export type OrganizationWithRole = Schemas['OrganizationWithRoleDto'];
export type OrganizationDetail = Schemas['OrganizationDetailDto'];
export type Project = Schemas['ProjectResponseDto'];
export type CreateProjectInput = Schemas['CreateProjectDto'];
export type UpdateProjectInput = Schemas['UpdateProjectDto'];
