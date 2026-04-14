function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const TABLE_MENU_QUERY_KEYS = {
  restaurant: "restaurant",
  table: "table",
  name: "name",
} as const;

export function buildTokenMenuLink(baseUrl: string, qrCodeToken: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  return `${normalizedBaseUrl}/menu?token=${encodeURIComponent(qrCodeToken)}`;
}

export function buildQueryMenuLink(
  baseUrl: string,
  restaurantSlug: string,
  tableNumber: string,
  restaurantName?: string | null
) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedRestaurantName = restaurantName?.trim();
  const query = new URLSearchParams({
    [TABLE_MENU_QUERY_KEYS.restaurant]: restaurantSlug,
    [TABLE_MENU_QUERY_KEYS.table]: tableNumber,
  });
  if (normalizedRestaurantName) {
    query.set(TABLE_MENU_QUERY_KEYS.name, normalizedRestaurantName);
  }
  return `${normalizedBaseUrl}/menu?${query.toString()}`;
}

export function buildPrettyMenuLink(
  baseUrl: string,
  restaurantSlug: string,
  tableNumber: string,
  restaurantName?: string | null
) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedRestaurantName = restaurantName?.trim();
  const query = new URLSearchParams({
    [TABLE_MENU_QUERY_KEYS.table]: tableNumber,
  });
  if (normalizedRestaurantName) {
    query.set(TABLE_MENU_QUERY_KEYS.name, normalizedRestaurantName);
  }
  return `${normalizedBaseUrl}/${restaurantSlug}/menu?${query.toString()}`;
}

export function buildQrCodeImageUrl(targetUrl: string, size: number = 640) {
  const query = new URLSearchParams({
    size: `${size}x${size}`,
    data: targetUrl,
  });

  return `https://api.qrserver.com/v1/create-qr-code/?${query.toString()}`;
}

export function buildRestaurantTableLinksCsv(args: {
  baseUrl: string;
  restaurantName: string;
  restaurantSlug: string;
  tables: Array<{
    tableNumber: string;
    qrCodeToken: string;
    active: boolean;
  }>;
}) {
  const csvHeaderRow = [
    "restaurant_name",
    "restaurant_slug",
    "table_number",
    "active",
    "token_url",
    "query_url",
    "pretty_url",
  ].join(",");
  const rows = [
    csvHeaderRow,
  ];

  for (const table of args.tables) {
    rows.push(
      [
        args.restaurantName,
        args.restaurantSlug,
        table.tableNumber,
        table.active ? "true" : "false",
        buildTokenMenuLink(args.baseUrl, table.qrCodeToken),
        buildQueryMenuLink(
          args.baseUrl,
          args.restaurantSlug,
          table.tableNumber,
          args.restaurantName
        ),
        buildPrettyMenuLink(
          args.baseUrl,
          args.restaurantSlug,
          table.tableNumber,
          args.restaurantName
        ),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    );
  }

  return rows.join("\n");
}
