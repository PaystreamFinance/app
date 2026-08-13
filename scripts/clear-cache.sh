#!/bin/bash

# Clear Next.js cache and rebuild
echo "Clearing Next.js cache..."

# Remove .next directory
rm -rf .next

# Remove Turbopack cache
rm -rf .turbo

# Remove node_modules/.cache if it exists
rm -rf node_modules/.cache

echo "Cache cleared! You can now restart your dev server."

