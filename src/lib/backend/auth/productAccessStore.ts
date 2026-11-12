import { getPromptStore } from "@/lib/backend/database";
import { isProductCode, PRODUCT_CODES, type ProductCode } from "@/lib/products";

interface OrganizationProductRow {
  product_code: string;
}

/** 현재 시각 기준으로 조직이 사용할 수 있는 제품. */
export async function productsForOrganization(organizationId: string): Promise<ProductCode[]> {
  const rows = await (await getPromptStore()).query<OrganizationProductRow>(
    `SELECT product_code
       FROM neodio_organization_products
      WHERE organization_id=$1
        AND status='active'
        AND (expires_at IS NULL OR expires_at > $2)
      ORDER BY product_code`,
    [organizationId, new Date().toISOString()]
  );
  return rows.map((row) => row.product_code).filter(isProductCode);
}

export async function organizationHasProduct(organizationId: string, product: ProductCode): Promise<boolean> {
  return (await productsForOrganization(organizationId)).includes(product);
}

/** 조직의 제품 구성을 교체한다. 호출 권한과 감사 로그는 상위 API에서 처리한다. */
export async function replaceOrganizationProducts(
  organizationId: string,
  products: readonly ProductCode[],
  grantedBy: string | null
): Promise<void> {
  const selected = new Set(products);
  const store = await getPromptStore();
  await store.transaction(async () => {
    for (const product of PRODUCT_CODES) {
      await store.query(
        `INSERT INTO neodio_organization_products
           (organization_id,product_code,status,granted_by,granted_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,NULL)
         ON CONFLICT(organization_id,product_code) DO UPDATE SET
           status=excluded.status,
           granted_by=CASE WHEN excluded.status='active' THEN excluded.granted_by ELSE neodio_organization_products.granted_by END,
           granted_at=CASE WHEN excluded.status='active' THEN excluded.granted_at ELSE neodio_organization_products.granted_at END`,
        [organizationId, product, selected.has(product) ? "active" : "suspended", grantedBy, new Date().toISOString()]
      );
    }
  });
}
