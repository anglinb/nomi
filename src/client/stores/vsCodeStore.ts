import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ProjectVsCodeLayout {
  isVisible: boolean
}

interface VsCodeState {
  projects: Record<string, ProjectVsCodeLayout>
  toggleVisibility: (projectId: string) => void
  clearProject: (projectId: string) => void
}

function createDefaultProjectLayout(): ProjectVsCodeLayout {
  return {
    isVisible: false,
  }
}

function getProjectLayout(projects: Record<string, ProjectVsCodeLayout>, projectId: string): ProjectVsCodeLayout {
  return projects[projectId] ?? createDefaultProjectLayout()
}

export const useVsCodeStore = create<VsCodeState>()(
  persist(
    (set) => ({
      projects: {},
      toggleVisibility: (projectId) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...getProjectLayout(state.projects, projectId),
              isVisible: !getProjectLayout(state.projects, projectId).isVisible,
            },
          },
        })),
      clearProject: (projectId) =>
        set((state) => {
          const { [projectId]: _removed, ...rest } = state.projects
          return { projects: rest }
        }),
    }),
    {
      name: "vscode-layouts",
      version: 1,
    }
  )
)

export const DEFAULT_PROJECT_VSCODE_LAYOUT: ProjectVsCodeLayout = {
  isVisible: false,
}
