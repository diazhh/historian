export interface TreeNode {
  id: string;
  name: string;
  entityType: 'ASSET' | 'DEVICE';
  level: number;
  expandable: boolean;
  loaded: boolean;
  children?: TreeNode[];
  tagCount?: number;
  label?: string;
}

export interface RelationInfo {
  from: { entityType: string; id: string };
  to: { entityType: string; id: string };
  type: string;
  typeGroup: string;
}
