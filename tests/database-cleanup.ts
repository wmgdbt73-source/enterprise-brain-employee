import type { PrismaClient } from '../packages/database/src/generated/prisma/client.js';

/** Clears current-schema test data in FK-safe child-to-parent order. */
export async function clearTestDatabase(db: PrismaClient): Promise<void> {
  await db.message.deleteMany();
  await db.conversationParticipant.deleteMany();
  await db.conversation.deleteMany();
  await db.notification.deleteMany();
  await db.reminder.deleteMany();
  await db.swarmEvent.deleteMany();
  await db.modelInvocation.deleteMany();
  await db.auditEvent.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.humanConfirmation.deleteMany();
  await db.review.deleteMany();
  await db.resultArtifact.deleteMany();
  await db.result.deleteMany();
  await db.artifact.deleteMany();
  await db.agentToolCall.deleteMany();
  await db.agentRun.deleteMany();
  await db.agentAssignment.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agentDefinition.deleteMany();
  await db.taskDependency.deleteMany();
  await db.taskAssignment.deleteMany();
  await db.task.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.departmentMembership.deleteMany();
  await db.permissionOverride.deleteMany();
  await db.organizationMembership.deleteMany();
  await db.department.deleteMany();
  await db.organization.deleteMany();
  await db.user.deleteMany();
}
