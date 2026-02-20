///
/// Industrial Historian - Tree Node model for Tag Browser
///

export interface TreeNode {
  id: string;
  name: string;
  entityType: 'ASSET' | 'DEVICE';
  profileName?: string;
  level: number;
  expanded: boolean;
  loading: boolean;
  children: TreeNode[];
  /** For DEVICE nodes only */
  lastValue?: number;
  engUnits?: string;
  quality?: number;
  selected?: boolean;
}
