import type { TaskInput } from '../../../../shared/enterprise-brain.js';
import type { TaskPriority } from '@enterprise-brain/contracts';

export function toTaskInput(input: {
  title: string;
  description: string;
  priority: TaskPriority;
  acceptanceCriteria: string;
  deadline: string;
}): TaskInput {
  const criteria = input.acceptanceCriteria
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const deadline = input.deadline ? new Date(input.deadline) : undefined;
  return {
    title: input.title,
    ...(input.description.trim() ? { description: input.description } : {}),
    priority: input.priority,
    ...(criteria.length ? { acceptanceCriteria: criteria } : {}),
    ...(deadline && !Number.isNaN(deadline.valueOf())
      ? { deadline: deadline.toISOString() }
      : {})
  };
}
