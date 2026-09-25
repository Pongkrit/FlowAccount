export const categories = ['อาหาร', 'เครื่องดื่ม', 'ของใช้', 'เสื้อผ้า'] as const;

export interface ProductInput {
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: (typeof categories)[number];
}

export interface Product extends ProductInput {
  id: number;
  createdAt: string;
}
