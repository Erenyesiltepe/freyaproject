// Utility functions for handling tags as JSON strings in SQLite

export function tagsToString(tags: string[]): string {
  return JSON.stringify(tags)
}

export function tagsFromString(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function searchPromptsByTags(tags: string[], searchTags: string[]): boolean {
  return searchTags.some(searchTag => tags.includes(searchTag))
}