export function getSelectedChildId(fallbackChildId?: string): string {
  // Check if a specific child ID was provided
  if (fallbackChildId) {
    return fallbackChildId;
  }

  // Check localStorage for selected child
  const selectedChildId = localStorage.getItem("selectedChildId");
  if (selectedChildId) {
    return selectedChildId;
  }

  // Default fallback
  return "1085268853542289410";
}

export function setSelectedChildId(childId: string | number): void {
  localStorage.setItem("selectedChildId", childId.toString());
}

export function clearSelectedChildId(): void {
  localStorage.removeItem("selectedChildId");
}