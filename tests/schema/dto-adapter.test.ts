import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  IsArray,
  IsInt,
  IsUrl,
} from 'class-validator';
import { DtoAdapter } from '../../src/schema/adapters/dto.adapter.js';

// ---------------------------------------------------------------------------
// Test DTO classes
// ---------------------------------------------------------------------------

enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

class CreateUserDto {
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}

class ConstrainedDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  @IsNumber()
  @Min(0)
  @Max(120)
  age!: number;
}

class SimpleTypesDto {
  @IsString()
  text!: string;

  @IsNumber()
  decimal!: number;

  @IsInt()
  integer!: number;

  @IsBoolean()
  flag!: boolean;
}

class EnumDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

class ArrayDto {
  @IsArray()
  tags!: string[];
}

class EmailUrlDto {
  @IsEmail()
  email!: string;

  @IsUrl()
  website!: string;
}

// Plain class with NO class-validator decorators
class PlainClass {
  name!: string;
  age!: number;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DtoAdapter', () => {
  let adapter: DtoAdapter;

  beforeEach(() => {
    adapter = new DtoAdapter();
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  it('has name "dto" and priority 20', () => {
    expect(adapter.name).toBe('dto');
    expect(adapter.priority).toBe(20);
  });

  // -----------------------------------------------------------------------
  // detect()
  // -----------------------------------------------------------------------

  describe('detect()', () => {
    it('detects a class-validator decorated DTO', () => {
      expect(adapter.detect(CreateUserDto)).toBe(true);
    });

    it('detects DTO with constraints', () => {
      expect(adapter.detect(ConstrainedDto)).toBe(true);
    });

    it('detects DTO with simple types', () => {
      expect(adapter.detect(SimpleTypesDto)).toBe(true);
    });

    it('does not detect a plain class without decorators', () => {
      expect(adapter.detect(PlainClass)).toBe(false);
    });

    it('does not detect null', () => {
      expect(adapter.detect(null)).toBe(false);
    });

    it('does not detect undefined', () => {
      expect(adapter.detect(undefined)).toBe(false);
    });

    it('does not detect a plain object', () => {
      expect(adapter.detect({ type: 'object' })).toBe(false);
    });

    it('does not detect a string', () => {
      expect(adapter.detect('CreateUserDto')).toBe(false);
    });

    it('does not detect a number', () => {
      expect(adapter.detect(42)).toBe(false);
    });

    it('does not detect an arrow function without metadata', () => {
      const fn = () => {};
      expect(adapter.detect(fn)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // extractJsonSchema()
  // -----------------------------------------------------------------------

  describe('extractJsonSchema()', () => {
    it('extracts properties with correct types', () => {
      const schema = adapter.extractJsonSchema(SimpleTypesDto);

      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();

      const props = schema.properties as Record<string, Record<string, unknown>>;
      expect(props.text).toEqual({ type: 'string' });
      expect(props.decimal).toEqual({ type: 'number' });
      expect(props.integer).toEqual({ type: 'integer' });
      expect(props.flag).toEqual({ type: 'boolean' });
    });

    it('marks all non-optional fields as required', () => {
      const schema = adapter.extractJsonSchema(SimpleTypesDto);
      const required = schema.required as string[];

      expect(required).toContain('text');
      expect(required).toContain('decimal');
      expect(required).toContain('integer');
      expect(required).toContain('flag');
    });

    it('handles required vs optional fields', () => {
      const schema = adapter.extractJsonSchema(CreateUserDto);
      const required = schema.required as string[];

      expect(required).toContain('name');
      expect(required).toContain('age');
      expect(required).toContain('email');
      expect(required).not.toContain('nickname');
    });

    it('handles string constraints (minLength, maxLength)', () => {
      const schema = adapter.extractJsonSchema(ConstrainedDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.username).toEqual({
        type: 'string',
        minLength: 3,
        maxLength: 50,
      });
    });

    it('handles number constraints (min, max)', () => {
      const schema = adapter.extractJsonSchema(ConstrainedDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.age).toEqual({
        type: 'number',
        minimum: 0,
        maximum: 120,
      });
    });

    it('handles email format', () => {
      const schema = adapter.extractJsonSchema(EmailUrlDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.email).toEqual({
        type: 'string',
        format: 'email',
      });
    });

    it('handles URL format', () => {
      const schema = adapter.extractJsonSchema(EmailUrlDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.website).toEqual({
        type: 'string',
        format: 'uri',
      });
    });

    it('handles enum values', () => {
      const schema = adapter.extractJsonSchema(EnumDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.role).toEqual({
        type: 'string',
        enum: ['admin', 'user', 'guest'],
      });
    });

    it('handles array type', () => {
      const schema = adapter.extractJsonSchema(ArrayDto);
      const props = schema.properties as Record<string, Record<string, unknown>>;

      expect(props.tags).toEqual({ type: 'array' });
    });

    it('returns empty required array when all fields are optional', () => {
      class AllOptionalDto {
        @IsOptional()
        @IsString()
        a?: string;

        @IsOptional()
        @IsNumber()
        b?: number;
      }

      const schema = adapter.extractJsonSchema(AllOptionalDto);
      expect(schema.required).toEqual([]);
    });

    it('produces a valid top-level object schema structure', () => {
      const schema = adapter.extractJsonSchema(CreateUserDto);

      expect(schema.type).toBe('object');
      expect(schema).toHaveProperty('properties');
      expect(schema).toHaveProperty('required');
      expect(Array.isArray(schema.required)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // extract()
  // -----------------------------------------------------------------------

  describe('extract()', () => {
    it('returns a TSchema-compatible object', () => {
      const schema = adapter.extract(CreateUserDto);

      // TSchema compatibility: has type, properties, required
      expect(schema).toHaveProperty('type');
      expect(schema).toHaveProperty('properties');
      expect(schema).toHaveProperty('required');
    });

    it('extracts the same schema as extractJsonSchema', () => {
      const jsonSchema = adapter.extractJsonSchema(CreateUserDto);
      const tSchema = adapter.extract(CreateUserDto);

      // The extract result should be equivalent to extractJsonSchema result
      expect(tSchema.type).toBe(jsonSchema.type);
      expect(tSchema).toHaveProperty('properties');
      expect(tSchema).toHaveProperty('required');
    });
  });
});
