CREATE OR REPLACE FUNCTION f_project_cash(
  p_horizon_days int,
  p_company_id text DEFAULT NULL
)
RETURNS TABLE (
  status              text,
  company_id          text,
  projected_net_cents bigint,
  band_low_cents      bigint,
  band_high_cents     bigint,
  confidence          numeric,
  method              text,
  reconciled_through  date,
  required_through    date,
  message             text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_required_through date := (date_trunc('week', CURRENT_DATE)::date - INTERVAL '7 days')::date;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT c.id AS cid
    FROM "Company" c
    WHERE c.active = true
      AND (p_company_id IS NULL OR c.id = p_company_id)
  LOOP
    DECLARE
      v_recon date;
      v_avg_daily_net bigint;
      v_projected bigint;
    BEGIN
      -- Check reconciliation freshness (reads reconciliation_log via SECURITY DEFINER)
      SELECT MAX("throughDate") INTO v_recon
      FROM reconciliation_log
      WHERE reconciliation_log."companyId" = v_row.cid;

      IF v_recon IS NULL OR v_recon < v_required_through THEN
        status := 'reconciliation_required';
        company_id := v_row.cid;
        projected_net_cents := NULL;
        band_low_cents := NULL;
        band_high_cents := NULL;
        confidence := NULL;
        method := NULL;
        reconciled_through := v_recon;
        required_through := v_required_through;
        message := 'Reconciliation required — last data through ' ||
                   COALESCE(v_recon::text, 'never') ||
                   '. Required through ' || v_required_through::text || '.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- Compute simple linear projection from trailing 90-day net cash
      SELECT COALESCE(AVG(net_cents), 0)::bigint INTO v_avg_daily_net
      FROM v_company_cash_daily
      WHERE v_company_cash_daily.company_id = v_row.cid
        AND date >= CURRENT_DATE - INTERVAL '90 days'
        AND date < CURRENT_DATE;

      v_projected := v_avg_daily_net * p_horizon_days;

      status := 'ok';
      company_id := v_row.cid;
      projected_net_cents := v_projected;
      band_low_cents := (v_projected * 0.7)::bigint;
      band_high_cents := (v_projected * 1.3)::bigint;
      confidence := 0.6;
      method := 'linear_90d_avg';
      reconciled_through := v_recon;
      required_through := v_required_through;
      message := NULL;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

-- Grant EXECUTE to vision_reader, revoke from PUBLIC
GRANT EXECUTE ON FUNCTION f_project_cash(int, text) TO vision_reader;
REVOKE EXECUTE ON FUNCTION f_project_cash(int, text) FROM PUBLIC;
