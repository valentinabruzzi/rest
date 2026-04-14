export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const nested =
      "cause" in error && error.cause ? getErrorMessage(error.cause) : "";
    return [error.message, nested].filter(Boolean).join(" ");
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isPrismaTemporarilyUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("data transfer quota") ||
    message.includes("driveradaptererror") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("econn") ||
    message.includes("database") ||
    message.includes("prisma")
  );
}
