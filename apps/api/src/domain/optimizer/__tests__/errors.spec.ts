import {
  InsufficientRidersError,
  ConflictingConstraintsError,
  RiderNotFoundError,
  BudgetExceededByLockedRidersError,
} from '../errors';

describe('Custom Error Classes', () => {
  it('should create InsufficientRidersError with correct message and name', () => {
    const error = new InsufficientRidersError(5, 9);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InsufficientRidersError);
    expect(error.name).toBe('InsufficientRidersError');
    expect(error.message).toBe('Not enough riders: 5 available, 9 required');
  });

  it('should create ConflictingConstraintsError with correct message and name', () => {
    const error = new ConflictingConstraintsError(['r1', 'r2']);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConflictingConstraintsError);
    expect(error.name).toBe('ConflictingConstraintsError');
    expect(error.message).toBe('Rider IDs appear in both mustInclude and mustExclude: r1, r2');
  });

  it('should create RiderNotFoundError with correct message and name', () => {
    const error = new RiderNotFoundError('abc-123');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RiderNotFoundError);
    expect(error.name).toBe('RiderNotFoundError');
    expect(error.message).toBe('Rider not found in pool: abc-123');
  });

  it('should create BudgetExceededByLockedRidersError with correct message and name', () => {
    const error = new BudgetExceededByLockedRidersError(1500, 1000);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BudgetExceededByLockedRidersError);
    expect(error.name).toBe('BudgetExceededByLockedRidersError');
    expect(error.message).toBe('Locked riders cost 1500 hillios, exceeding budget of 1000');
  });
});
