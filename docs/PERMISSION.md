# Permission Model（权限模型）

> Status: Alpha baseline / Alpha 基线。This is intentionally simpler than the future enterprise RBAC / ABAC model.

## 1. Principle（原则）

Permission is evaluated by:

`Subject（主体） + Role（角色） + Object（对象） + Scope（范围） + Action（动作）`

Agent permission is not equal to user permission, and Work mode is not equal to whole-device permission.

## 2. Business Roles（业务角色）

SystemRole:
- EMPLOYEE（员工）
- ADMIN（管理员）

ProjectMemberRole:
- OWNER（项目负责人）
- MEMBER（成员）
- REVIEWER（评审人）

Future production roles may be more granular.

## 3. Business Permissions（业务权限）

Initial permissions:
- READ（读取）
- WRITE（修改）
- REVIEW（评审）
- ADMIN（管理）

Example:
- Employee can read assigned Project / Task scope and submit Result Candidate when authorized.
- Project Owner may assign work and review Result when authorized.
- Admin manages broader configuration.

## 4. Local Desktop Permissions（本地电脑权限）

Separate permission namespace:
- LOCAL_READ（本地读取）
- LOCAL_MODIFY（本地修改）
- LOCAL_CREATE（本地创建）
- LOCAL_DELETE（本地删除）
- LOCAL_EXECUTE（本地执行）

EB-007 activates only `LOCAL_READ`. All modify/create/delete/execute permissions
and their tools remain deferred.

## 5. Workspace Scope（工作区范围）

WorkspaceBinding key:

`user_id + project_id + device_id`

A local request must be rejected if its path is outside the authorized Workspace root.

## 6. Human Confirmation（人工确认）

Alpha baseline:
- read operations inside authorized Workspace: no extra confirmation after binding;
- write / create: confirmation required initially;
- delete: confirmation required;
- execute command: confirmation required;
- expanding Workspace scope: confirmation required.

## 7. Agent Permission（Agent 权限）

Agent receives a derived permission scope from:
- invoking user;
- current Project / Task context;
- current WorkspaceBinding;
- tool-specific restrictions.

Agent must never gain broader device or enterprise permissions simply because it is running in Work mode.

## 8. Formal State Changes（正式状态变更）

Server-side authorization is required for:
- assigning Task;
- submitting Result;
- reviewing Result;
- accepting Result;
- permission changes;
- destructive Project actions.

Frontend-only state is never authoritative.

## 9. Audit（审计）

Audit at minimum:
- actor;
- action;
- object;
- scope;
- permission used;
- timestamp;
- result;
- human confirmation when applicable.

## 10. Production TBD（正式版待确认）

Not frozen in Alpha:
- complete RBAC / ABAC matrix;
- Project DRI and member administration rights;
- all Agent formal-operation permissions;
- enterprise compliance retention;
- full role inheritance across organization hierarchy.
