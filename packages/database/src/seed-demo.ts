import { createHash } from 'node:crypto';
import { createPrismaClient } from './client.js';
import { encodePassword, normalizeLogin } from './auth/password.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for demo seed');
const target = new URL(url);
if (
  process.env.NODE_ENV === 'production' ||
  /(^|[-.])prod(uction)?([-.]|$)/i.test(target.hostname) ||
  /prod(uction)?/i.test(target.pathname)
)
  throw new Error(
    'The demo seed is development-only and refuses a production-looking DATABASE_URL.'
  );
const db = createPrismaClient(url);
const now = new Date();
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
// Development-only credentials. Do not run this command against production data.
const accounts = [
  {
    id: 'demo-employee',
    name: 'Demo Employee',
    login: 'employee@example.test',
    password: 'DemoEmployee!2026',
    systemRole: 'EMPLOYEE' as const
  },
  {
    id: 'demo-reviewer',
    name: 'Demo Reviewer',
    login: 'reviewer@example.test',
    password: 'DemoReviewer!2026',
    systemRole: 'EMPLOYEE' as const
  },
  {
    id: 'demo-admin',
    name: 'Demo Admin',
    login: 'admin@example.test',
    password: 'DemoAdmin!2026',
    systemRole: 'ADMIN' as const
  }
];
for (const item of accounts) {
  const passwordHash = await encodePassword(item.password);
  const user = await db.user.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      name: item.name,
      systemRole: item.systemRole,
      createdAt: now,
      updatedAt: now
    },
    update: { name: item.name, systemRole: item.systemRole, updatedAt: now }
  });
  await db.account.upsert({
    where: { userId: user.id },
    create: {
      id: `${item.id}-account`,
      userId: user.id,
      login: normalizeLogin(item.login)!,
      passwordHash,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: {
      login: normalizeLogin(item.login)!,
      passwordHash,
      status: 'ACTIVE',
      updatedAt: now
    }
  });
}
await db.organization.upsert({
  where: { id: 'enterprise-brain-demo' },
  create: {
    id: 'enterprise-brain-demo',
    name: 'Enterprise Brain Demo',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  },
  update: { name: 'Enterprise Brain Demo', status: 'ACTIVE', updatedAt: now }
});
for (const item of [
  { id: 'demo-org-admin', userId: 'demo-admin', role: 'OWNER' as const },
  { id: 'demo-org-employee', userId: 'demo-employee', role: 'MEMBER' as const },
  { id: 'demo-org-reviewer', userId: 'demo-reviewer', role: 'MEMBER' as const }
])
  await db.organizationMembership.upsert({
    where: { userId: item.userId },
    create: {
      ...item,
      organizationId: 'enterprise-brain-demo',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: { role: item.role, status: 'ACTIVE', updatedAt: now }
  });
for (const item of [
  { id: 'demo-department-product', name: 'Product' },
  { id: 'demo-department-research', name: 'Research' }
])
  await db.department.upsert({
    where: { id: item.id },
    create: {
      ...item,
      organizationId: 'enterprise-brain-demo',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: { name: item.name, status: 'ACTIVE', updatedAt: now }
  });
for (const item of [
  {
    id: 'demo-department-employee',
    userId: 'demo-employee',
    departmentId: 'demo-department-product',
    role: 'MEMBER' as const
  },
  {
    id: 'demo-department-reviewer',
    userId: 'demo-reviewer',
    departmentId: 'demo-department-research',
    role: 'MEMBER' as const
  }
])
  await db.departmentMembership.upsert({
    where: { userId: item.userId },
    create: {
      ...item,
      organizationId: 'enterprise-brain-demo',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: {
      departmentId: item.departmentId,
      role: item.role,
      status: 'ACTIVE',
      updatedAt: now
    }
  });
// A shared, review-capable project. The employee can submit a Result and the
// separate reviewer account can accept or request rework through public APIs.
await db.project.upsert({
  where: { id: 'demo-review-project' },
  create: {
    id: 'demo-review-project',
    name: 'Demo Review Project',
    goal: 'Exercise the employee to reviewer flow',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  },
  update: {
    name: 'Demo Review Project',
    goal: 'Exercise the employee to reviewer flow',
    status: 'ACTIVE',
    updatedAt: now
  }
});
for (const member of [
  {
    id: 'demo-review-project-employee',
    userId: 'demo-employee',
    role: 'OWNER' as const
  },
  {
    id: 'demo-review-project-reviewer',
    userId: 'demo-reviewer',
    role: 'REVIEWER' as const
  }
]) {
  await db.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: 'demo-review-project',
        userId: member.userId
      }
    },
    create: {
      ...member,
      projectId: 'demo-review-project',
      createdAt: now,
      updatedAt: now
    },
    update: { role: member.role, updatedAt: now }
  });
}
// Catalog entries are organization-owned; assignments, not client-side keys,
// determine which demo employee may initiate a new run.
for (const item of [
  {
    id: 'demo-agent-research',
    key: 'research-agent',
    name: 'Research Agent',
    runtimeProfile: 'READ_ONLY_WORK' as const
  },
  {
    id: 'demo-agent-file-writer',
    key: 'file-writer-agent',
    name: 'File Writer Agent',
    runtimeProfile: 'CONFIRMED_WRITE_WORK' as const
  }
]) {
  await db.agentDefinition.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      organizationId: 'enterprise-brain-demo',
      key: item.key,
      name: item.name,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: { key: item.key, name: item.name, status: 'ACTIVE', updatedAt: now }
  });
  await db.agentVersion.upsert({
    where: {
      agentDefinitionId_version: { agentDefinitionId: item.id, version: 1 }
    },
    create: {
      id: `${item.id}-v1`,
      agentDefinitionId: item.id,
      version: 1,
      runtimeProfile: item.runtimeProfile,
      status: 'ACTIVE',
      createdAt: now
    },
    update: { runtimeProfile: item.runtimeProfile, status: 'ACTIVE' }
  });
}
for (const item of [
  {
    id: 'demo-agent-research-org',
    agentDefinitionId: 'demo-agent-research',
    scopeType: 'ORGANIZATION' as const,
    scopeId: 'enterprise-brain-demo'
  },
  {
    id: 'demo-agent-writer-employee',
    agentDefinitionId: 'demo-agent-file-writer',
    scopeType: 'USER' as const,
    scopeId: 'demo-employee'
  }
])
  await db.agentAssignment.upsert({
    where: {
      organizationId_agentDefinitionId_scopeType_scopeId: {
        organizationId: 'enterprise-brain-demo',
        agentDefinitionId: item.agentDefinitionId,
        scopeType: item.scopeType,
        scopeId: item.scopeId
      }
    },
    create: {
      ...item,
      organizationId: 'enterprise-brain-demo',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    update: { status: 'ACTIVE', updatedAt: now }
  });
// Connected, production-valid walkthrough state. Library and Action Queue are
// derived by the collaboration repository from these persisted records.
const projectId = 'demo-review-project';
const tasks = [
  {
    id: 'demo-task-research',
    title: 'Review customer interview themes',
    status: 'IN_PROGRESS' as const,
    priority: 'P1' as const,
    description: 'Prepare the evidence for the launch brief.',
    criteria: ['Summarize three customer themes.']
  },
  {
    id: 'demo-task-review',
    title: 'Review the launch brief',
    status: 'READY_FOR_REVIEW' as const,
    priority: 'P1' as const,
    description: 'A completed brief awaits Demo Reviewer.',
    criteria: ['Record a human review decision.']
  },
  {
    id: 'demo-task-accepted',
    title: 'Archive approved launch brief',
    status: 'ACCEPTED' as const,
    priority: 'P2' as const,
    description: 'Completed employee-to-reviewer example.',
    criteria: ['Keep the accepted result and artifact.']
  },
  {
    id: 'demo-task-follow-up',
    title: 'Schedule customer follow-up',
    status: 'TODO' as const,
    priority: 'P2' as const,
    description: 'Starts after the approved launch brief.',
    criteria: ['Confirm next customer touchpoint.']
  }
];
for (const task of tasks) {
  await db.task.upsert({
    where: { id: task.id },
    create: {
      id: task.id,
      projectId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      acceptanceCriteria: task.criteria,
      deadline: ago(-1440),
      createdAt: ago(300),
      updatedAt: now
    },
    update: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      acceptanceCriteria: task.criteria,
      deadline: ago(-1440),
      updatedAt: now
    }
  });
  await db.taskAssignment.upsert({
    where: { taskId: task.id },
    create: { taskId: task.id, projectId, userId: 'demo-employee' },
    update: { projectId, userId: 'demo-employee' }
  });
}
await db.taskDependency.upsert({
  where: {
    taskId_dependsOnTaskId: {
      taskId: 'demo-task-follow-up',
      dependsOnTaskId: 'demo-task-accepted'
    }
  },
  create: {
    taskId: 'demo-task-follow-up',
    dependsOnTaskId: 'demo-task-accepted',
    projectId
  },
  update: { projectId }
});
async function seedArtifact(
  runId: string,
  callId: string,
  artifactId: string,
  taskId: string,
  path: string,
  content: string
) {
  const hash = sha(content);
  const request = {
    id: callId,
    runId,
    userId: 'demo-employee',
    projectId,
    name: 'read_file',
    relativePath: path
  };
  const receipt = {
    toolCallId: callId,
    status: 'SUCCEEDED',
    metadata: {
      relativePath: path,
      size: Buffer.byteLength(content),
      encoding: 'utf-8',
      sha256: hash
    }
  };
  await db.agentRun.upsert({
    where: { id: runId },
    create: {
      id: runId,
      userId: 'demo-employee',
      projectId,
      taskId,
      agentDefinitionKey: 'research-agent',
      agentVersion: 1,
      kind: 'TOOL',
      intent: { name: 'read_file', relativePath: path },
      status: 'SUCCEEDED',
      createdAt: ago(240),
      startedAt: ago(239),
      finishedAt: ago(238),
      updatedAt: ago(238)
    },
    update: {
      userId: 'demo-employee',
      projectId,
      taskId,
      agentDefinitionKey: 'research-agent',
      agentVersion: 1,
      kind: 'TOOL',
      intent: { name: 'read_file', relativePath: path },
      status: 'SUCCEEDED',
      startedAt: ago(239),
      finishedAt: ago(238),
      updatedAt: now
    }
  });
  await db.agentToolCall.upsert({
    where: { id: callId },
    create: {
      id: callId,
      agentRunId: runId,
      sequence: 1,
      name: 'read_file',
      request,
      status: 'SUCCEEDED',
      receipt,
      createdAt: ago(240),
      completedAt: ago(238)
    },
    update: {
      agentRunId: runId,
      sequence: 1,
      name: 'read_file',
      request,
      status: 'SUCCEEDED',
      receipt,
      completedAt: ago(238)
    }
  });
  await db.artifact.upsert({
    where: { id: artifactId },
    create: {
      id: artifactId,
      projectId,
      taskId,
      agentRunId: runId,
      sourceToolCallId: callId,
      type: 'FILE',
      storageKind: 'LOCAL_WORKSPACE',
      relativePath: path,
      size: Buffer.byteLength(content),
      encoding: 'utf-8',
      sha256: hash,
      version: 1,
      createdByUserId: 'demo-employee',
      createdAt: ago(237)
    },
    update: {
      projectId,
      taskId,
      agentRunId: runId,
      sourceToolCallId: callId,
      relativePath: path,
      size: Buffer.byteLength(content),
      encoding: 'utf-8',
      sha256: hash,
      version: 1,
      createdByUserId: 'demo-employee'
    }
  });
}
await seedArtifact(
  'demo-run-review',
  'demo-call-review',
  'demo-artifact-review',
  'demo-task-review',
  'demo/customer-insights-launch-brief.md',
  '# Customer Insights Launch Brief\nReady for review.\n'
);
await seedArtifact(
  'demo-run-accepted',
  'demo-call-accepted',
  'demo-artifact-accepted',
  'demo-task-accepted',
  'demo/approved-launch-brief.md',
  '# Approved Launch Brief\nAccepted by Demo Reviewer.\n'
);
for (const value of [
  {
    id: 'demo-result-review',
    taskId: 'demo-task-review',
    status: 'HUMAN_REVIEW' as const,
    key: '000000000101',
    artifactId: 'demo-artifact-review'
  },
  {
    id: 'demo-result-accepted',
    taskId: 'demo-task-accepted',
    status: 'ACCEPTED' as const,
    key: '000000000102',
    artifactId: 'demo-artifact-accepted'
  },
  {
    id: 'demo-result-draft',
    taskId: 'demo-task-research',
    status: 'CANDIDATE' as const,
    key: '000000000103',
    artifactId: 'demo-artifact-review'
  }
]) {
  await db.result.upsert({
    where: { id: value.id },
    create: {
      id: value.id,
      projectId,
      taskId: value.taskId,
      createdByUserId: 'demo-employee',
      submittedByUserId: value.status === 'CANDIDATE' ? null : 'demo-employee',
      submittedAt: value.status === 'CANDIDATE' ? null : ago(180),
      status: value.status,
      idempotencyKey: `00000000-0000-4000-8000-${value.key}`,
      requestFingerprint: sha(value.id),
      createdAt: ago(200),
      updatedAt: now
    },
    update: {
      status: value.status,
      submittedByUserId: value.status === 'CANDIDATE' ? null : 'demo-employee',
      submittedAt: value.status === 'CANDIDATE' ? null : ago(180),
      updatedAt: now
    }
  });
  if (value.taskId !== 'demo-task-research')
    await db.resultArtifact.upsert({
      where: {
        resultId_artifactId: {
          resultId: value.id,
          artifactId: value.artifactId
        }
      },
      create: {
        resultId: value.id,
        artifactId: value.artifactId,
        taskId: value.taskId,
        projectId
      },
      update: { taskId: value.taskId, projectId }
    });
}
await db.review.upsert({
  where: { resultId: 'demo-result-accepted' },
  create: {
    id: 'demo-review-accepted',
    resultId: 'demo-result-accepted',
    projectId,
    reviewerId: 'demo-reviewer',
    decision: 'ACCEPT',
    comment: 'Approved for the launch handoff.',
    reviewedAt: ago(120)
  },
  update: {
    reviewerId: 'demo-reviewer',
    decision: 'ACCEPT',
    comment: 'Approved for the launch handoff.',
    reviewedAt: ago(120)
  }
});
await db.agentRun.upsert({
  where: { id: 'demo-model-run' },
  create: {
    id: 'demo-model-run',
    userId: 'demo-employee',
    projectId,
    taskId: 'demo-task-research',
    agentDefinitionKey: 'research-agent',
    agentVersion: 1,
    kind: 'MODEL',
    intent: {
      name: 'model_generate',
      inputHash: sha('Summarize the customer themes.')
    },
    status: 'SUCCEEDED',
    createdAt: ago(100),
    startedAt: ago(100),
    finishedAt: ago(99),
    updatedAt: ago(99)
  },
  update: { status: 'SUCCEEDED', updatedAt: now, finishedAt: ago(99) }
});
await db.modelInvocation.upsert({
  where: { id: 'demo-model-invocation' },
  create: {
    id: 'demo-model-invocation',
    agentRunId: 'demo-model-run',
    initiatedByUserId: 'demo-employee',
    provider: 'demo-history',
    model: 'deterministic-demo',
    status: 'COMPLETED',
    inputText: 'Summarize the customer themes.',
    inputHash: sha('Summarize the customer themes.'),
    outputText:
      'Customers want clearer launch timing, evidence-backed recommendations, and a named owner for follow-up.',
    inputTokens: 8,
    outputTokens: 18,
    totalTokens: 26,
    idempotencyKey: 'demo-model-history-0001',
    requestFingerprint: sha('demo-model-history-0001'),
    createdAt: ago(100),
    completedAt: ago(99)
  },
  update: {
    status: 'COMPLETED',
    outputText:
      'Customers want clearer launch timing, evidence-backed recommendations, and a named owner for follow-up.',
    completedAt: ago(99)
  }
});
await db.conversation.upsert({
  where: { id: 'demo-human-group' },
  create: {
    id: 'demo-human-group',
    organizationId: 'enterprise-brain-demo',
    type: 'HUMAN_GROUP',
    scopeType: 'PROJECT',
    scopeId: projectId,
    title: 'Customer Insights launch room',
    createdByUserId: 'demo-employee',
    createdAt: ago(90),
    updatedAt: now
  },
  update: { title: 'Customer Insights launch room', updatedAt: now }
});
for (const userId of ['demo-employee', 'demo-reviewer'])
  await db.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId: 'demo-human-group', userId }
    },
    create: { conversationId: 'demo-human-group', userId, createdAt: ago(90) },
    update: {}
  });
for (const message of [
  {
    id: 'demo-message-employee',
    authorUserId: 'demo-employee',
    content: 'The launch brief is ready for review.',
    mentions: ['demo-reviewer']
  },
  {
    id: 'demo-message-reviewer',
    authorUserId: 'demo-reviewer',
    content: 'I will review the evidence and decision record.',
    mentions: []
  }
])
  await db.message.upsert({
    where: { id: message.id },
    create: {
      id: message.id,
      conversationId: 'demo-human-group',
      authorType: 'USER',
      authorUserId: message.authorUserId,
      content: message.content,
      mentionedUserIds: message.mentions,
      mentionedAgentIds: [],
      idempotencyKey: message.id,
      createdAt: ago(80)
    },
    update: { content: message.content, mentionedUserIds: message.mentions }
  });
for (const value of [
  {
    id: 'demo-notification-review',
    userId: 'demo-reviewer',
    type: 'MENTION',
    title: 'Launch brief review',
    body: 'Demo Employee mentioned you in the launch room.',
    deepLink: '/conversations/demo-human-group'
  },
  {
    id: 'demo-notification-employee',
    userId: 'demo-employee',
    type: 'TASK',
    title: 'Research task in progress',
    body: 'Use the Research Agent or the seeded model history.',
    deepLink: '/tasks/demo-task-research'
  }
])
  await db.notification.upsert({
    where: { id: value.id },
    create: {
      id: value.id,
      organizationId: 'enterprise-brain-demo',
      recipientUserId: value.userId,
      type: value.type,
      title: value.title,
      body: value.body,
      deepLink: value.deepLink,
      createdAt: ago(70)
    },
    update: { title: value.title, body: value.body, deepLink: value.deepLink }
  });
await db.reminder.upsert({
  where: { id: 'demo-reminder-review' },
  create: {
    id: 'demo-reminder-review',
    organizationId: 'enterprise-brain-demo',
    userId: 'demo-reviewer',
    type: 'REVIEW',
    title: 'Review Customer Insights launch brief',
    dueAt: ago(-1440),
    status: 'SCHEDULED',
    deepLink: '/results/demo-result-review',
    createdAt: ago(60),
    updatedAt: now
  },
  update: { status: 'SCHEDULED', dueAt: ago(-1440), updatedAt: now }
});
await db.swarmEvent.upsert({
  where: { id: 'demo-swarm-launch' },
  create: {
    id: 'demo-swarm-launch',
    organizationId: 'enterprise-brain-demo',
    scopeType: 'PROJECT',
    scopeId: projectId,
    type: 'GROUP_MESSAGE',
    actorUserId: 'demo-employee',
    title: 'Launch brief submitted for review',
    summary:
      'Customer evidence and recommendation are ready for Demo Reviewer.',
    deepLink: '/conversations/demo-human-group',
    occurredAt: ago(75)
  },
  update: {
    title: 'Launch brief submitted for review',
    summary:
      'Customer evidence and recommendation are ready for Demo Reviewer.',
    occurredAt: ago(75)
  }
});
await db.$disconnect();
