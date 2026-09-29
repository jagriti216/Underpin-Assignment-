// Unit tests for taskService.js (no HTTP, just the functions)

const taskService = require('../src/services/taskService');

// Clear the store before each test
beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  // New task gets default values
  test('creates a task with default values', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Write tests');
    expect(task.description).toBe('');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(new Date(task.createdAt).toString()).not.toBe('Invalid Date');
  });

  // Given values replace defaults
  test('uses the values passed in instead of defaults', () => {
    const task = taskService.create({
      title: 'Ship it',
      description: 'deploy to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });

    expect(task).toMatchObject({
      description: 'deploy to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
  });

  // Ids should never repeat
  test('gives every task a unique id', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll', () => {
  // Empty store gives empty list
  test('returns an empty array when there are no tasks', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  // Returns every task
  test('returns all created tasks', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    expect(taskService.getAll()).toHaveLength(2);
  });

  // Result is a copy, not the real store
  test('returns a copy, so changing the result does not change the store', () => {
    taskService.create({ title: 'A' });
    const list = taskService.getAll();
    list.pop();
    expect(taskService.getAll()).toHaveLength(1);
  });
});

describe('findById', () => {
  // Finds a real task
  test('finds an existing task', () => {
    const task = taskService.create({ title: 'A' });
    expect(taskService.findById(task.id)).toEqual(task);
  });

  // Unknown id gives undefined
  test('returns undefined for an unknown id', () => {
    expect(taskService.findById('does-not-exist')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  // Only matching status comes back
  test('returns only tasks with the given status', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'done' });

    const result = taskService.getByStatus('todo');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('A');
  });

  // BUG (not fixed): "do" matches "todo" and "done" because of includes()
  test.failing('does not match partial status strings', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'done' });

    expect(taskService.getByStatus('do')).toEqual([]);
  });
});

describe('getPaginated', () => {
  // Helper: makes n tasks called "Task 1" ... "Task n"
  const seed = (n) => {
    for (let i = 1; i <= n; i++) taskService.create({ title: `Task ${i}` });
  };

  // ===== Day 2, Part B: fixed bug =====
  // Bug: offset was page * limit, so page 1 skipped the first page.
  // Fix: changed offset to (page - 1) * limit in getPaginated.
  // These were test.failing before the fix. Now they are normal tests and pass.
  test('page 1 returns the first items', () => {
    seed(5);
    const result = taskService.getPaginated(1, 2);
    expect(result.map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
  });

  test('page 2 returns the next items', () => {
    seed(5);
    const result = taskService.getPaginated(2, 2);
    expect(result.map((t) => t.title)).toEqual(['Task 3', 'Task 4']);
  });

  // Last page can have fewer items than the limit
  test('last page returns the remaining items', () => {
    seed(5);
    const result = taskService.getPaginated(3, 2);
    expect(result.map((t) => t.title)).toEqual(['Task 5']);
  });
  // ===== End of Day 2, Part B =====

  // Page past the end gives empty list
  test('returns an empty array for a page past the end', () => {
    seed(3);
    expect(taskService.getPaginated(10, 2)).toEqual([]);
  });
});

describe('getStats', () => {
  // No tasks means all zeros
  test('returns zero counts when there are no tasks', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  // Counts each status
  test('counts tasks by status', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });

    expect(taskService.getStats()).toMatchObject({ todo: 2, in_progress: 1, done: 1 });
  });

  // Overdue = past due date and not done
  test('counts overdue tasks: past due date and not done', () => {
    const past = '2000-01-01T00:00:00.000Z';
    const future = '2999-01-01T00:00:00.000Z';

    taskService.create({ title: 'overdue', dueDate: past });                  // counts
    taskService.create({ title: 'done late', dueDate: past, status: 'done' }); // done, skip
    taskService.create({ title: 'future', dueDate: future });                 // not due yet
    taskService.create({ title: 'no due date' });                             // no date

    expect(taskService.getStats().overdue).toBe(1);
  });
});

describe('update', () => {
  // Changes given fields, keeps the rest
  test('updates the given fields and keeps the rest', () => {
    const task = taskService.create({ title: 'Old', priority: 'low' });
    const updated = taskService.update(task.id, { title: 'New' });

    expect(updated.title).toBe('New');
    expect(updated.priority).toBe('low');
    expect(taskService.findById(task.id).title).toBe('New'); // saved in store
  });

  // Unknown id gives null
  test('returns null for an unknown id', () => {
    expect(taskService.update('does-not-exist', { title: 'X' })).toBeNull();
  });

  // BUG (not fixed): update copies every field, so id can be changed
  test.failing('does not allow changing the id', () => {
    const task = taskService.create({ title: 'A' });
    const updated = taskService.update(task.id, { id: 'hacked' });
    expect(updated.id).toBe(task.id);
  });
});

describe('remove', () => {
  // Deletes and returns true
  test('deletes an existing task and returns true', () => {
    const task = taskService.create({ title: 'A' });
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  // Unknown id gives false
  test('returns false for an unknown id', () => {
    expect(taskService.remove('does-not-exist')).toBe(false);
  });
});

describe('completeTask', () => {
  // Sets status to done and adds completedAt
  test('marks the task as done and sets completedAt', () => {
    const task = taskService.create({ title: 'A' });
    const done = taskService.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
  });

  // Unknown id gives null
  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('does-not-exist')).toBeNull();
  });

  // BUG (not fixed): priority is always reset to "medium"
  test.failing('does not change the priority', () => {
    const task = taskService.create({ title: 'A', priority: 'high' });
    const done = taskService.completeTask(task.id);
    expect(done.priority).toBe('high');
  });
});

// ===== Day 2, Part C: assignTask =====
describe('assignTask', () => {
  // Saves the trimmed name
  test('assigns a task and trims the name', () => {
    const task = taskService.create({ title: 'A' });
    const updated = taskService.assignTask(task.id, '  Priya ');
    expect(updated.assignee).toBe('Priya');
    expect(taskService.findById(task.id).assignee).toBe('Priya');
  });

  // Unknown id gives null
  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('does-not-exist', 'Priya')).toBeNull();
  });
});
// ===== End of Day 2, Part C =====