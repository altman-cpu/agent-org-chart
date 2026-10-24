// Provider-neutral contracts for the DASH business starter.
// Implementations should call an authorized server-side adapter or approved vault-backed service;
// browser code must never hold provider secrets or call private endpoints directly.

export type DateRange = { from: string; to: string }
export interface DateRangeQuery extends DateRange {
  limit?: number
}

// Proposed internal routes only. They are not implemented by the static client.
export const PROPOSED_BUSINESS_READ_ROUTES = {
  services: '/api/v1/business/services',
  bookings: '/api/v1/business/bookings',
  rideshareTripSummaries: '/api/v1/rideshare/trip-summaries',
  settlementSummaries: '/api/v1/payments/settlement-summaries',
  digitalAssets: '/api/v1/digital-assets/assets',
  currentQuotes: '/api/v1/digital-assets/quotes',
  integrationStatus: '/api/v1/integrations/status',
} as const

export interface BusinessServiceRecord {
  id: string
  name: string
  description: string
  priceMinor: number | null
  currency: string
  active: boolean
}

export interface BookingRecord {
  id: string
  serviceId: string
  scheduledAt: string
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled'
}

export interface DriverTripSummary {
  providerTripId: string
  completedAt: string
  grossMinor: number
  currency: string
  miles: number | null
  onlineHours: number | null
}

export interface SettlementSummary {
  settlementId: string
  settledAt: string
  amountMinor: number
  currency: string
  status: 'pending' | 'paid' | 'reversed'
}

export interface DigitalAssetMetadata {
  assetId: string
  symbol: string
  name: string
  network: string | null
}

export interface DigitalAssetQuote {
  assetId: string
  // Decimal string avoids floating-point rounding in asset prices.
  price: string
  currency: string
  observedAt: string
}

export interface ReadOnlyResponse<T> {
  schemaVersion: '1.0'
  mode: 'read_only'
  source: {
    provider: string
    network?: string
    observedAt: string
    verification: 'verified' | 'pending'
  }
  data: T
  warnings: string[]
}

export const REQUESTED_DIGITAL_ASSET_SOURCE = {
  providerLabel: 'Genesis Tencen',
  requestedSpec: 'ABI OMNI 1000',
  verification: 'pending',
  initialScope: 'read-only-current-market-data',
} as const

export const DIGITAL_ASSET_READ_POLICY = {
  readOnly: true,
  storePastAnalytics: false,
  personalizeFromUserHistory: false,
  executeTransactions: false,
  accessWalletCredentials: false,
} as const

// Intentionally read-only contracts for the first integration milestone.
// No account mutation, payout changes, trade execution, or asset transfers.
export interface BookingAdapter {
  listServices(): Promise<ReadOnlyResponse<BusinessServiceRecord[]>>
  listBookings(query: DateRangeQuery): Promise<ReadOnlyResponse<BookingRecord[]>>
}

export interface RideshareAdapter {
  listTripSummaries(query: DateRangeQuery): Promise<ReadOnlyResponse<DriverTripSummary[]>>
}

export interface PaymentsAdapter {
  listSettlementSummaries(query: DateRangeQuery): Promise<ReadOnlyResponse<SettlementSummary[]>>
}

export interface DigitalAssetMarketDataAdapter {
  listAssets(search?: string): Promise<ReadOnlyResponse<DigitalAssetMetadata[]>>
  getCurrentQuotes(assetIds: string[]): Promise<ReadOnlyResponse<DigitalAssetQuote[]>>
}

export interface BusinessAdapters {
  booking?: BookingAdapter
  rideshare?: RideshareAdapter
  payments?: PaymentsAdapter
  digitalAssets?: DigitalAssetMarketDataAdapter
}

export type ConnectorId = 'booking' | 'rideshare' | 'payments' | 'digital-assets'

export interface ConnectorDefinition {
  id: ConnectorId
  label: string
  provider: string
  detail: string
  status: string
}

// These are setup requests, not connected integrations. Real providers and docs must be verified.
export const BUSINESS_CONNECTORS: readonly ConnectorDefinition[] = [
  {
    id: 'booking',
    label: 'Booking / point of sale',
    provider: 'Provider not selected',
    detail: 'Reservations, service catalog, and order status for the wash business.',
    status: 'Mock adapter',
  },
  {
    id: 'rideshare',
    label: 'Rideshare platforms',
    provider: 'Uber / Mystro — not connected',
    detail: 'Only integrate a public, documented interface with explicit permission. The current workflow is manual.',
    status: 'Needs official docs',
  },
  {
    id: 'payments',
    label: 'Payments / accounting',
    provider: 'Provider not selected',
    detail: 'Payment status and reconciliation; no card data or payment credentials belong in this browser app.',
    status: 'Mock adapter',
  },
  {
    id: 'digital-assets',
    label: 'Crypto digital-asset data',
    provider: `${REQUESTED_DIGITAL_ASSET_SOURCE.providerLabel} · ${REQUESTED_DIGITAL_ASSET_SOURCE.requestedSpec} — unverified`,
    detail: 'Requested default category. Safe initial scope: read-only current asset metadata and quotes; no history or personalization.',
    status: 'Not configured',
  },
]
