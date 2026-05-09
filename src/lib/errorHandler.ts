import { toast } from "sonner";

export const handleApiError = (error: any, context?: string) => {
  // Background logging (not visible to typical users)
  console.error(`[API Error] ${context || 'Unknown context'}:`, error);

  let userMessage = "An unexpected error occurred. Please try again.";

  if (error instanceof TypeError && error.message === "Failed to fetch") {
    userMessage = "Unable to connect to the server. Please check your network connection and try again.";
  } else if (error?.message) {
    userMessage = error.message;
  } else if (typeof error === 'string') {
    userMessage = error;
  }

  // Fallback cleanup to prevent raw JS errors
  if (
    userMessage.includes("TypeError:") || 
    userMessage.toLowerCase().includes("failed to fetch") ||
    userMessage.toLowerCase().includes("fetch failed")
  ) {
    userMessage = "Network connection failed. Your Supabase database project might be paused or offline.";
  }

  toast.error(userMessage, {
    description: context ? `Failed during: ${context}` : undefined,
  });
};
