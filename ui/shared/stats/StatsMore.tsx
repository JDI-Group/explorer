/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable no-restricted-imports */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { Link } from '@chakra-ui/react';
import { cover, loop, pipe } from '@hairy/utils';
import { moonchainMainnet, moonchainHudson } from '@moonchain-mch/metadata';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import gql from 'graphql-tag';
import { useEffect } from 'react';
import { createPublicClient, getContract, http } from 'viem';
import { arbitrum, arbitrumSepolia, bsc, bscTestnet } from 'viem/chains';

import config from 'configs/app';
import { Hint } from 'toolkit/components/Hint/Hint';
import StatsWidget from 'ui/shared/stats/StatsWidget';

import { fragments } from './StatsMore.fragments';

const configs = {
  testnet: {
    clients: {
      moonchain: createPublicClient({ chain: moonchainHudson, transport: http() }),
      l1: createPublicClient({ chain: bscTestnet, transport: http() }),
    },
    addresses: {
      l1: { moonchainL1: '0x1d33883d0D4CD84F566fd1f4dC47B625c66b5dc1' },
      l2: { moonchainL2: '0x1778880000000000000000000000000000010001' },
    },
  },
  mainnet: {
    clients: {
      moonchain: createPublicClient({ chain: moonchainMainnet, transport: http() }),
      l1: createPublicClient({ chain: bsc, transport: http() }),
    },
    addresses: {
      l1: { moonchainL1: '0xB262d982623A9cE0E80e2A779E1B283eab11b2E3' },
      l2: { moonchainL2: '0x9998880000000000000000000000000000010001' },
    },
  },
} as const;

const getOptions = {
  mainnet: () => ({
    // graph: new ApolloClient({
    //   link: new HttpLink({ uri: configs.mainnet.graph }),
    //   cache: new InMemoryCache(),
    // }),
    clients: configs.mainnet.clients,
    addresses: configs.mainnet.addresses,
    contracts: {
      l1: getContract({
        abi: fragments.l1,
        address: configs.mainnet.addresses.l1.moonchainL1,
        client: configs.mainnet.clients.l1,
      }),
      l2: getContract({
        abi: fragments.l2,
        address: configs.mainnet.addresses.l2.moonchainL2,
        client: configs.mainnet.clients.moonchain,
      }),
    },
    chains: {
      l1: bsc,
      moonchain: moonchainMainnet,
    },
  }),
  testnet: () => ({
    // graph: new ApolloClient({
    //   link: new HttpLink({ uri: configs.testnet.graph }),
    //   cache: new InMemoryCache(),
    // }),
    clients: configs.testnet.clients,
    addresses: configs.testnet.addresses,
    contracts: {
      l1: getContract({
        abi: fragments.l1,
        address: configs.testnet.addresses.l1.moonchainL1,
        client: configs.testnet.clients.l1,
      }),
      l2: getContract({
        abi: fragments.l2,
        address: configs.testnet.addresses.l2.moonchainL2,
        client: configs.testnet.clients.moonchain,
      }),
    },
    chains: {
      l1: bscTestnet,
      moonchain: moonchainMainnet,
    },
  }),
} as const;

const { contracts, clients, chains } = config.chain.id === '177888' ?
  getOptions.testnet() :
  getOptions.mainnet();

function StatsMoreViem({ icon = true }: { icon?: boolean } = {}) {
  const l2latestSyncedHeader = useQuery({
    queryKey: [ 'statsMore_l2latestSyncedHeader' ],
    queryFn: async() => {
      const [ _, blockHash ] = await contracts.l1.read.getLastSyncedBlock();
      return blockHash;
    },
  });
  const l1latestSyncedHeader = useQuery({
    queryKey: [ 'statsMore_l1latestSyncedHeader' ],
    queryFn: async() => {
      // fetch moonchain lastSyncedBlock
      const lastSyncedBlock = await contracts.l2.read.lastSyncedBlock();
      // fetch l1 lastSyncedBlock blockHash
      const block = await clients.l1.getBlock({ blockNumber: lastSyncedBlock });
      return block.hash;
    },
  });
  const lastVerifiedBlock = useQuery({
    queryKey: [ 'statsMore_lastVerifiedBlock' ],
    queryFn: async() => {
      const [ blockId ] = await contracts.l1.read.getLastVerifiedBlock();
      return blockId;
    },
  });
  const unverifiedBlocks = useQuery({
    queryKey: [ 'statsMore_unverifiedBlocks' ],
    queryFn: async() => {
      const [ lastVerifiedBlock ] = await contracts.l1.read.getLastVerifiedBlock();
      const lastBlock = await clients.moonchain.getBlockNumber();
      return lastBlock - lastVerifiedBlock;
    },
  });
  const availableSlots = useQuery({
    queryKey: [ 'statsMore_availableSlots' ],
    queryFn: async() => {
      const [ lastVerifiedBlock ] = await contracts.l1.read.getLastVerifiedBlock();
      const lastBlock = await clients.moonchain.getBlockNumber();
      const config = await contracts.l1.read.getConfig();
      return config.blockRingBufferSize - (lastBlock - lastVerifiedBlock) % config.blockRingBufferSize;
    },
  });
  const latestProofTime = useQuery({
    queryKey: [ 'statsMore_latestProofTime' ],
    queryFn: async() => {
      const [ lastVerifiedBlock ] = await contracts.l1.read.getLastVerifiedBlock();
      const { verifiedTransitionId } = await contracts.l1.read.getBlockV2([ lastVerifiedBlock ]);
      const transition = await contracts.l1.read.getTransition([ lastVerifiedBlock, verifiedTransitionId ]) as any;
      return transition.timestamp;
    },
  });
  // const burnsTotal = useQuery({
  //   queryKey: [ 'statsMore_burnsTotal' ],
  //   queryFn: pipe.promise(
  //     () => graph.query({ query: queries.burn }),
  //     result => result?.data?.bundle.burn || 0,
  //     burns => parseInt(burns),
  //   ),
  // });

  useEffect(
    () => {
      const cancel = loop(async(next) => {
        await next(20000); // 20s
        l2latestSyncedHeader.refetch();
        l1latestSyncedHeader.refetch();
        lastVerifiedBlock.refetch();
        unverifiedBlocks.refetch();
        availableSlots.refetch();
        latestProofTime.refetch();
        // burnsTotal.refetch();
      });
      return () => cancel();
    },
    [],
  );

  return (
    <>
      <StatsWidget
        icon={ icon ? 'burger' : undefined }
        label="L1 Latest Synced Header"
        value={ (
          <Link
            onClick={ () => {
              const explorer = chains.l1.blockExplorers.default;
              window.open(`${ explorer.url }/block/${ l1latestSyncedHeader.data }`, '_blank');
            } }
          >
            { cover(l1latestSyncedHeader.data || '', [ 4, 4, 4 ]) }
          </Link>
        ) }
        isLoading={ l1latestSyncedHeader.isLoading }
        hint={ <Hint label="The most recent Layer 2 Header that has been synchronized with the MoonchainL1 smart contract."/> }
      />
      <StatsWidget
        icon={ icon ? 'burger' : undefined }
        label="L2 Latest Synced Header"
        value={ (
          <Link
            onClick={ () => {
              const explorer = chains.moonchain.blockExplorers.default;
              window.open(`${ explorer.url }/block/${ l2latestSyncedHeader.data }`, '_blank');
            } }
          >
            { cover(l2latestSyncedHeader.data || '', [ 4, 4, 4 ]) }
          </Link>
        ) }
        isLoading={ l2latestSyncedHeader.isLoading }
        hint={ <Hint label="The most recent Layer 1 Header that has been synchronized with the MoonchainL2 smart contract. The headers are synchronized with every L2 block."/> }
      />
      <StatsWidget
        icon={ icon ? 'block' : undefined }
        label="Last Verified Block"
        value={ lastVerifiedBlock.data?.toString() }
        isLoading={ lastVerifiedBlock.isLoading }
        hint={ <Hint label="The latest block that has been verified."/> }
      />
      <StatsWidget
        icon={ icon ? 'block' : undefined }
        label="Unverified Blocks"
        value={ unverifiedBlocks.data?.toString() }
        isLoading={ unverifiedBlocks.isLoading }
        hint={ <Hint label="The number of blocks that have not been verified yet."/> }
      />
      <StatsWidget
        icon={ icon ? 'burger' : undefined }
        label="Available Slots"
        value={ availableSlots.data?.toString() }
        isLoading={ availableSlots.isLoading }
        hint={ <Hint label="The amount of slots for proposed blocks on the MoonchainL1 smart contract. When this number is 0, no blocks can be proposed until a block has been proven."/> }
      />
      <StatsWidget
        icon={ icon ? 'ABI' : undefined }
        label="Latest Proof Time"
        value={ latestProofTime.data ? dayjs.unix(Number(latestProofTime.data)).format('YYYY-MM-DD HH:mm:ss') : '' }
        isLoading={ latestProofTime.isLoading }
        hint={ <Hint label="The time of the latest proof."/> }
      />
    </>
  );
}

export default StatsMoreViem;
