<?php

namespace handplant\craftgeoman\helpers;

use JsonException;
use stdClass;

final class GeoJson
{
    public static function isValid(mixed $value): bool
    {
        if (!is_string($value)) {
            return false;
        }
        try {
            $data = json_decode($value, false, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return false;
        }
        return self::validate($data);
    }

    private static function every(mixed $values, callable $validate, int $minimum = 0): bool
    {
        if (!is_array($values) || count($values) < $minimum) {
            return false;
        }
        foreach ($values as $value) {
            if (!$validate($value)) {
                return false;
            }
        }
        return true;
    }

    private static function position(mixed $value): bool
    {
        return self::every($value, fn($number) => (is_int($number) || is_float($number)) && is_finite((float)$number), 2);
    }

    private static function line(mixed $value): bool
    {
        return self::every($value, self::position(...), 2);
    }

    private static function ring(mixed $value): bool
    {
        return self::every($value, self::position(...), 4) && $value[0] == $value[count($value) - 1];
    }

    private static function polygon(mixed $value): bool
    {
        return self::every($value, self::ring(...), 1);
    }

    private static function validate(mixed $value, int $depth = 0): bool
    {
        if (!$value instanceof stdClass || $depth > 64) {
            return false;
        }
        $next = fn($child) => self::validate($child, $depth + 1);
        $geometry = fn($child) => $child instanceof stdClass && !in_array($child->type ?? null, ['Feature', 'FeatureCollection'], true) && $next($child);
        return match ($value->type ?? null) {
            'FeatureCollection' => self::every($value->features ?? null, fn($feature) => ($feature->type ?? null) === 'Feature' && $next($feature)),
            'Feature' => (!isset($value->properties) || $value->properties instanceof stdClass)
                && (($value->properties->shape ?? null) !== 'Text'
                    || (($value->geometry->type ?? null) === 'Point' && is_string($value->properties->text ?? null)))
                && $geometry($value->geometry ?? null),
            'GeometryCollection' => self::every($value->geometries ?? null, $geometry),
            'Point' => self::position($value->coordinates ?? null),
            'MultiPoint' => self::every($value->coordinates ?? null, self::position(...), 1),
            'LineString' => self::line($value->coordinates ?? null),
            'MultiLineString' => self::every($value->coordinates ?? null, self::line(...), 1),
            'Polygon' => self::polygon($value->coordinates ?? null),
            'MultiPolygon' => self::every($value->coordinates ?? null, self::polygon(...), 1),
            default => false,
        };
    }
}
