<script lang="ts">
  import type { TaxMeta } from '../types/taxRules';
  export let meta: TaxMeta;
</script>

<div class="rules-info">
  <span class="badge">{meta.tax_year} Tax Rules</span>
  <span class="label">{meta.label}</span>
  <span class="updated">Updated {meta.last_updated}</span>
</div>

<style>
  .rules-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    font-size: 13px;
    color: #666;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .badge {
    background: #1A1A1A;
    color: #fff;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .label { font-weight: 500; color: #1A1A1A; }
  .updated { margin-left: auto; }
</style>
