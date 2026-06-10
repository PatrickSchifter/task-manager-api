import Anthropic from '@anthropic-ai/sdk'

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_knowledge_base',
    description:
      "Search projects, tasks, comments, and personal routines using semantic similarity. Use this to answer questions about the user's data. Always try this first for informational questions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query or question to find relevant information',
        },
        status: {
          type: 'array',
          items: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          description: 'Optional: filter results by task status',
        },
        priority: {
          type: 'array',
          items: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          description: 'Optional: filter results by task priority',
        },
        projectId: {
          type: 'string',
          description:
            'Optional: filter to a specific project UUID (use find_project_by_name to resolve a name to an ID)',
        },
        sourceTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['TASK', 'COMMENT', 'PROJECT', 'ATTACHMENT', 'ROUTINE'],
          },
          description:
            'Optional: filter results by source type. ROUTINE = personal recurring activities with scheduled times.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_project_by_name',
    description:
      'Find projects by name (partial match, case-insensitive). Use this to resolve a project name to its UUID before performing project-specific operations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Project name or partial name to search',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'find_task',
    description:
      'Find tasks by title keywords within accessible projects. Use this to resolve a task name to its UUID before performing task-specific operations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Task title keywords to search for',
        },
        projectId: {
          type: 'string',
          description: 'Optional: limit search to a specific project UUID',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project. The current user automatically becomes the project owner.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        description: {
          type: 'string',
          description: 'Optional project description',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new task in a project. Requires the projectId UUID — use find_project_by_name first if only the name is known.',
    input_schema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: 'The project UUID where the task will be created',
        },
        title: {
          type: 'string',
          description: 'Task title',
        },
        description: {
          type: 'string',
          description: 'Optional task description',
        },
        status: {
          type: 'string',
          enum: ['TODO', 'IN_PROGRESS', 'DONE'],
          description: 'Task status (default: TODO)',
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'Task priority (default: MEDIUM)',
        },
        dueDate: {
          type: 'string',
          description: 'Optional due date in ISO 8601 format (e.g. 2024-12-31)',
        },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'add_comment',
    description:
      'Add a comment to a task. Requires the taskId UUID — use find_task first if only the task name is known.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'The task UUID to add the comment to',
        },
        content: {
          type: 'string',
          description: 'Comment content',
        },
      },
      required: ['taskId', 'content'],
    },
  },
  {
    name: 'invite_collaborator',
    description:
      'Invite a registered user to collaborate on a project (by email). Only the project owner can invite collaborators.',
    input_schema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: 'The project UUID to invite the collaborator to',
        },
        email: {
          type: 'string',
          description: 'Email address of the user to invite',
        },
        role: {
          type: 'string',
          enum: ['VIEWER', 'EDITOR'],
          description: 'Collaborator role (default: EDITOR)',
        },
      },
      required: ['projectId', 'email'],
    },
  },
  {
    name: 'explain_platform_feature',
    description:
      'Returns documentation about a specific platform feature. Use whenever the user asks how to use a feature, what a feature does, or how something works in the platform.',
    input_schema: {
      type: 'object' as const,
      properties: {
        feature: {
          type: 'string',
          enum: ['overview', 'projects', 'tasks', 'routines', 'chat'],
          description:
            'The feature to explain. Use "overview" for a general platform introduction.',
        },
      },
      required: ['feature'],
    },
  },
]
