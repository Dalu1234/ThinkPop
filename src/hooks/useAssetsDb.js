import { useState, useMemo } from 'react';
import assetsData from '../data/assetsDatabase.json';

export function useAssetsDb() {
  const [assets, setAssets] = useState(assetsData);

  const getAssetsByCategory = (category) => {
    return assets.filter(asset => asset.category === category);
  };

  const searchAssetsByTag = (tag) => {
    return assets.filter(asset => asset.tags.includes(tag));
  };

  const getAssetById = (id) => {
    return assets.find(asset => asset.id === id);
  };

  // Add more database-like queries here as needed
  
  return {
    assets,
    getAssetsByCategory,
    searchAssetsByTag,
    getAssetById
  };
}
