export type AgencyWithdrawalLedgerRow = {
  kind?: 'host' | 'agency';
  agencyId?: string;
  amountCoins: number;
  status: string;
};

export function rowKind(
  row: AgencyWithdrawalLedgerRow,
): 'host' | 'agency' {
  return row.kind === 'agency' ? 'agency' : 'host';
}

export function collectedAgencyCoins(
  rows: AgencyWithdrawalLedgerRow[],
  agencyId: string,
): number {
  return rows
    .filter(
      (row) =>
        rowKind(row) === 'host' &&
        row.agencyId === agencyId &&
        row.status === 'agency_paid',
    )
    .reduce((sum, row) => sum + Math.max(0, Math.floor(row.amountCoins)), 0);
}

export function reservedAgencyCoins(
  rows: AgencyWithdrawalLedgerRow[],
  agencyId: string,
): number {
  return rows
    .filter(
      (row) =>
        rowKind(row) === 'agency' &&
        row.agencyId === agencyId &&
        row.status !== 'failed',
    )
    .reduce((sum, row) => sum + Math.max(0, Math.floor(row.amountCoins)), 0);
}

export function availableAgencyCoins(
  rows: AgencyWithdrawalLedgerRow[],
  agencyId: string,
): number {
  return Math.max(
    0,
    collectedAgencyCoins(rows, agencyId) - reservedAgencyCoins(rows, agencyId),
  );
}
