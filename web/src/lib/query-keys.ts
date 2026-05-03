export const queryKeys = {
  health: () => ['health'] as const,
  projects: () => ['projects'] as const,
  projectSessions: (projectId: string) => ['project-sessions', projectId] as const,
  session: (projectId: string, sessionId: string) =>
    ['session', projectId, sessionId] as const,
  diskUsage: () => ['disk-usage'] as const,
};
