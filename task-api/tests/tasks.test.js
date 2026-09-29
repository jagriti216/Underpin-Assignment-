// Integration tests for the /tasks routes.
// Supertest sends real HTTP requests through Express -> route -> validator -> service,
// so these check the API the way a client would actually use it.

const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Start every test with an empty in-memory store.
beforeEach(() => {
  taskService._reset();
});

// Helper: create a task through the API and return the response body.
const createTask = async (body) => {
  const res = await request(app).post('/tasks').send(body);
  return res.body;
};

describe('POST /tasks', () => {
  test('creates a task and returns 201', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Write tests', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Write tests',
      priority: 'high',
      status: 'todo', // default
      completedAt: null,
    });
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('returns 400 when title is only spaces', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when title is not a string', async () => {
    const res = await request(app).post('/tasks').send({ title: 123 });
    expect(res.status).toBe(400);
  });

  test('returns 400 for an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', status: 'pending' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  test('returns 400 for an invalid priority', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', priority: 'urgent' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/);
  });

  test('returns 400 for an invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dueDate/);
  });

  // BUG: validators check `body.status && ...`, so an empty string is falsy,
  // skips validation, and gets stored as the status. Expected: 400.
  test.failing('returns 400 for an empty-string status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'A', status: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'A' });
    await createTask({ title: 'B' });

    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('filters by status', async () => {
    await createTask({ title: 'A', status: 'todo' });
    await createTask({ title: 'B', status: 'done' });

    const res = await request(app).get('/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('B');
  });

  // BUG: the status filter does a substring match, so ?status=do
  // returns both "todo" and "done" tasks. Expected: no matches.
  test.failing('does not match partial status values', async () => {
    await createTask({ title: 'A', status: 'todo' });
    await createTask({ title: 'B', status: 'done' });

    const res = await request(app).get('/tasks?status=do');
    expect(res.body).toEqual([]);
  });

  // Day 2, Part B: fixed. page 1 now returns the first page.
  test('page=1 returns the first page of results', async () => {
    for (let i = 1; i <= 3; i++) await createTask({ title: `Task ${i}` });

    const res = await request(app).get('/tasks?page=1&limit=2');
    expect(res.body.map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
  });

  test('uses default limit when only page is given', async () => {
    for (let i = 1; i <= 3; i++) await createTask({ title: `Task ${i}` });

    const res = await request(app).get('/tasks?page=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('handles non-numeric page and limit without crashing', async () => {
    await createTask({ title: 'A' });

    const res = await request(app).get('/tasks?page=abc&limit=xyz');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts by status and overdue count', async () => {
    await createTask({ title: 'A', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ title: 'B', status: 'in_progress' });
    await createTask({ title: 'C', status: 'done' });

    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  // No tasks means all zeros
  test('returns all zeros when there are no tasks', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  // A done task is never overdue
  test('does not count a done task as overdue', async () => {
    await createTask({ title: 'A', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(0);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates a task', async () => {
    const task = await createTask({ title: 'Old' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'New', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'New', priority: 'high' });
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  test('returns 400 for an empty title', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for an invalid status', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'finished' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for an invalid priority', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for an invalid dueDate', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ dueDate: 'tomorrow-ish' });
    expect(res.status).toBe(400);
  });

  // BUG: PUT merges the whole body into the task, so the client can
  // overwrite createdAt (and id). Expected: these stay unchanged.
  test.failing('does not allow overwriting createdAt', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ createdAt: '1999-01-01T00:00:00.000Z' });
    expect(res.body.createdAt).toBe(task.createdAt);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes a task and returns 204', async () => {
    const task = await createTask({ title: 'A' });

    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/does-not-exist');
    expect(res.status).toBe(404);
  });

  // Second delete of the same task gives 404
  test('deleting the same task twice returns 404 the second time', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).delete(`/tasks/${task.id}`);
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(404);
  });

  // Only the chosen task is removed
  test('only deletes the targeted task', async () => {
    const a = await createTask({ title: 'A' });
    await createTask({ title: 'B' });
    await request(app).delete(`/tasks/${a.id}`);
    const list = await request(app).get('/tasks');
    expect(list.body.map((t) => t.title)).toEqual(['B']);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks a task as done', async () => {
    const task = await createTask({ title: 'A' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/complete');
    expect(res.status).toBe(404);
  });

  // BUG: completeTask hardcodes priority to 'medium'. Expected: priority kept.
  test.failing('keeps the original priority', async () => {
    const task = await createTask({ title: 'A', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('high');
  });
});

// ===== Day 2, Part C: PATCH /tasks/:id/assign =====
describe('PATCH /tasks/:id/assign', () => {
  // Happy path: saves the name and returns the task
  test('assigns a task and returns the updated task', async () => {
    const task = await createTask({ title: 'A' });

    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Priya' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
    expect(res.body.assignee).toBe('Priya');
  });

  // Name is really saved, not just returned
  test('the assignee is saved on the task', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Priya' });

    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Priya');
  });

  // New tasks start with no assignee
  test('new tasks start unassigned', async () => {
    const task = await createTask({ title: 'A' });
    expect(task.assignee).toBeNull();
  });

  // Extra spaces are removed
  test('trims spaces around the name', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '  Priya  ' });
    expect(res.body.assignee).toBe('Priya');
  });

  // Reassigning replaces the old name
  test('reassigning replaces the previous assignee', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Rahul' });

    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Priya' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Priya');
  });

  // Other fields stay the same
  test('does not change other fields', async () => {
    const task = await createTask({ title: 'A', priority: 'high', status: 'in_progress' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Priya' });
    expect(res.body).toMatchObject({ title: 'A', priority: 'high', status: 'in_progress' });
  });

  // 404 for a task that does not exist
  test('returns 404 for an unknown task', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/assign').send({ assignee: 'Priya' });
    expect(res.status).toBe(404);
  });

  // 400 for an empty name
  test('returns 400 for an empty assignee', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '' });
    expect(res.status).toBe(400);
  });

  // 400 for spaces only
  test('returns 400 for a spaces-only assignee', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '   ' });
    expect(res.status).toBe(400);
  });

  // 400 when assignee is missing
  test('returns 400 when assignee is missing', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({});
    expect(res.status).toBe(400);
  });

  // 400 when assignee is not a string
  test('returns 400 when assignee is not a string', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 123 });
    expect(res.status).toBe(400);
  });

  // 400 when the name is too long
  test('returns 400 when assignee is longer than 100 characters', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'a'.repeat(101) });
    expect(res.status).toBe(400);
  });
});
// ===== End of Day 2, Part C =====

describe('Error handling', () => {
  // BUG: the global error handler in app.js turns every error into a 500,
  // including express.json() parse errors, which are the client's fault.
  // Expected: 400 Bad Request for malformed JSON.
  test.failing('returns 400 for malformed JSON instead of crashing', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": bad json}');
    expect(res.status).toBe(400);
  });
});