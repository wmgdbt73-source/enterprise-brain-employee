import { describe, expect, it } from 'vitest';
import {
  addProjectMember,
  asProjectMemberId
} from '../../packages/domain/src/index.js';
import {
  createProjectFixture,
  memberId,
  now,
  ownerId,
  projectId,
  reviewerId
} from './fixtures.js';
import { expectDomainError } from './assertions.js';

describe('ProjectMember rules', () => {
  it('creates MEMBER and REVIEWER memberships', () => {
    const fixture = createProjectFixture();
    const member = addProjectMember(
      fixture.members,
      {
        id: asProjectMemberId('member-1'),
        projectId,
        userId: memberId,
        role: 'MEMBER'
      },
      now
    );
    const reviewer = addProjectMember(
      [...fixture.members, member],
      {
        id: asProjectMemberId('member-2'),
        projectId,
        userId: reviewerId,
        role: 'REVIEWER'
      },
      now
    );

    expect(member.role).toBe('MEMBER');
    expect(reviewer.role).toBe('REVIEWER');
  });

  it('rejects duplicate membership in the supplied member collection', () => {
    const fixture = createProjectFixture();

    expectDomainError(
      () =>
        addProjectMember(
          fixture.members,
          {
            id: asProjectMemberId('member-duplicate'),
            projectId,
            userId: ownerId,
            role: 'MEMBER'
          },
          now
        ),
      'DUPLICATE_PROJECT_MEMBER'
    );
  });

  it('rejects a second OWNER in the supplied member collection', () => {
    const fixture = createProjectFixture();

    expectDomainError(
      () =>
        addProjectMember(
          fixture.members,
          {
            id: asProjectMemberId('member-second-owner'),
            projectId,
            userId: memberId,
            role: 'OWNER'
          },
          now
        ),
      'OWNER_ALREADY_EXISTS'
    );
  });
});
