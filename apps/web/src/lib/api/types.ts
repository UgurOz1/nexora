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

export type TaskStatus = Schemas['TaskStatus'];
export type TaskPriority = Schemas['TaskPriority'];
export type Task = Schemas['TaskResponseDto'];
export type TaskDetail = Schemas['TaskDetailResponseDto'];
export type TaskPage = Schemas['TaskPageResponseDto'];
export type Board = Schemas['BoardResponseDto'];
export type BoardColumn = Schemas['BoardColumnResponseDto'];
export type CreateTaskInput = Schemas['CreateTaskDto'];
export type UpdateTaskInput = Schemas['UpdateTaskDto'];
export type HistoryEvent = Schemas['HistoryEventResponseDto'];
export type HistoryPage = Schemas['HistoryPageResponseDto'];
export type Member = Schemas['MemberResponseDto'];
