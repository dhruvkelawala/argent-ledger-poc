import {
  Abi,
  Call,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  Signature,
  Signer,
  SignerInterface,
  TypedData,
  V2InvocationsSignerDetails,
  V3InvocationsSignerDetails,
  hash,
  stark,
  transaction,
  RPC,
  CallData,
  V2DeployAccountSignerDetails,
  V3DeployAccountSignerDetails,
  typedData,
  encode,
  CairoCustomEnum,
  uint256,
  num,
  cairo
} from "starknet";
import LedgerETH from "@ledgerhq/hw-app-eth";

export class MultisigEthSigner implements SignerInterface {
  constructor(public eth: LedgerETH, public derivatePath: string) {}

  async getPubKey(): Promise<string> {
    const { address } = await this.eth.getAddress(this.derivatePath);
    return num.toHex(address);
  }

  async signMessage(
    data: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    const msgHash = typedData.getMessageHash(data, accountAddress);
    const sig = await this.eth.signPersonalMessage(
      this.derivatePath,
      Buffer.from(msgHash).toString("hex")
    );

    const publicKey = await this.getPubKey();

    return this.ethereumSignatureType(publicKey, sig);
  }

  async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails,
    abis?: Abi[] | undefined
  ): Promise<Signature> {
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      details.cairoVersion
    );
    let msgHash;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version
      });
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
      });
    } else {
      throw Error("unsupported signTransaction version");
    }

    // if (msgHash.length < 66) {
    //   msgHash = "0x" + "0".repeat(66 - msgHash.length) + msgHash.slice(2);
    // }
    msgHash = encode.sanitizeHex(msgHash);

    console.log("🚀 ~ MultisigSigner ~ msgHash:", msgHash);

    const sig = await this.eth.signPersonalMessage(
      this.derivatePath,
      Buffer.from(msgHash.slice(2), "hex").toString("hex")
    );

    const publicKey = await this.getPubKey();

    return ["0x1", ...this.ethereumSignatureType(publicKey, sig)];
  }

  public async signDeployAccountTransaction(
    details: DeployAccountSignerDetails
  ): Promise<Signature> {
    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata
    );
    /*     const version = BigInt(details.version).toString(); */
    let msgHash;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version as any)
    ) {
      const det = details as V2DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version
      });
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode)
      });
    } else {
      throw Error("unsupported signDeployAccountTransaction version");
    }

    if (msgHash.length < 66) {
      msgHash = "0x" + "0".repeat(66 - msgHash.length) + msgHash.slice(2);
    }

    msgHash = encode.removeHexPrefix(msgHash);
    console.log("🚀 ~ MultisigSigner ~ msgHash:", msgHash);

    const sig = await this.eth.signPersonalMessage(
      this.derivatePath,
      Buffer.from(msgHash, "hex").toString("hex")
    );

    // const signedHash = "0x" + r + s + v.toString(16);

    // const sig = hexToSignature(signedHash);

    const publicKey = await this.getPubKey();

    return ["0x1", ...this.ethereumSignatureType(publicKey, sig)];
  }

  signDeclareTransaction(
    transaction: DeclareSignerDetails
  ): Promise<Signature> {
    throw new Error("Method not implemented.");
  }

  getYParity(v: number): 0 | 1 {
    return v === 27 ? 0 : 1;
  }

  private ethereumSignatureType(
    signer: string,
    signature: { r: string; s: string; v: number | string }
  ) {
    console.log("🚀 ~ MultisigSigner ~ signature:", signature);
    return CallData.compile([
      new CairoCustomEnum({
        Starknet: undefined,
        Secp256k1: undefined,
        Secp256r1: undefined,
        Eip191: {
          signer,
          r: uint256.bnToUint256("0x" + signature.r),
          s: uint256.bnToUint256("0x" + signature.s),
          yParity: this.getYParity(Number(signature.v))
        },
        Webauthn: undefined
      })
    ]);
  }
}
