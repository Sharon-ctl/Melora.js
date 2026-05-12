import { type ChatInputCommandInteraction, type Message, type Guild, type GuildMember, type TextBasedChannel, type User, type BaseMessageOptions, MessageFlags, type InteractionResponse } from 'discord.js';
import type { MeloraClient } from '../core/Client.js';

export class CommandContext {
    public readonly client: MeloraClient;
    public readonly interaction?: ChatInputCommandInteraction;
    public readonly message?: Message;
    public readonly isPrefix: boolean;
    
    public readonly guild: Guild;
    public readonly channel: TextBasedChannel;
    public readonly member: GuildMember;
    public readonly user: User;
    
    private sentReply?: Message | InteractionResponse;

    constructor(client: MeloraClient, source: ChatInputCommandInteraction | Message) {
        this.client = client;
        
        if ('commandName' in source) {
            // It's an interaction
            this.interaction = source;
            this.isPrefix = false;
        } else {
            // It's a message
            this.message = source;
            this.isPrefix = true;
        }

        this.guild = source.guild as Guild;
        this.channel = source.channel as TextBasedChannel;
        this.member = source.member as GuildMember;
        this.user = this.interaction ? this.interaction.user : (this.message as Message).author;
    }

    private formatPayload(options: BaseMessageOptions | string, ephemeral?: boolean): BaseMessageOptions {
        const payload = typeof options === 'string' ? { content: options } : options as any;
        if (ephemeral && !this.isPrefix) {
            payload.flags = (payload.flags || 0) | MessageFlags.Ephemeral;
        }

        if (payload.components && Array.isArray(payload.components)) {
            const hasContainerBuilder = payload.components.some((c: any) => c && c.constructor && c.constructor.name === 'ContainerBuilder');
            if (hasContainerBuilder) {
                payload.flags = (payload.flags || 0) | MessageFlags.IsComponentsV2;
            }
        }

        return payload as BaseMessageOptions;
    }

    async deferReply(ephemeral: boolean = false): Promise<void> {
        if (this.interaction) {
            await this.interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
        }
        // For prefix commands, we do nothing. We removed the typing indicator to ensure
        // maximum speed and immediate responsiveness.
    }

    async reply(options: BaseMessageOptions | string, ephemeral: boolean = false): Promise<Message | InteractionResponse | undefined> {
        const payload = this.formatPayload(options, ephemeral);
        
        if (this.interaction) {
            if (this.interaction.deferred || this.interaction.replied) {
                this.sentReply = await this.interaction.editReply(payload);
            } else {
                const response = await this.interaction.reply({ ...payload, withResponse: true });
                this.sentReply = response.resource?.message ?? undefined;
            }
            return this.sentReply;
        } else if (this.message) {
            if ('send' in this.channel) {
                this.sentReply = await (this.channel as any).send(payload as any) as Message;
                return this.sentReply;
            }
        }
        return undefined;
    }

    async editReply(options: BaseMessageOptions | string): Promise<Message | InteractionResponse | undefined> {
        const payload = this.formatPayload(options);
        
        if (this.interaction) {
            this.sentReply = await this.interaction.editReply(payload);
            return this.sentReply;
        } else if (this.message) {
            if (this.sentReply && 'edit' in this.sentReply) {
                this.sentReply = await (this.sentReply as Message).edit(payload);
                return this.sentReply;
            } else {
                // Fallback to sending a new message if we somehow lost the original reply
                return this.reply(payload);
            }
        }
        return undefined;
    }

    async followUp(options: BaseMessageOptions | string, ephemeral: boolean = false): Promise<Message | undefined> {
        const payload = this.formatPayload(options, ephemeral);
        
        if (this.interaction) {
            return await this.interaction.followUp(payload);
        } else if (this.message) {
            if ('send' in this.channel) {
                return await this.channel.send(payload as any) as Message;
            }
        }
        return undefined;
    }

    async tempReply(options: BaseMessageOptions | string, _deleteAfterMs: number = 5000): Promise<void> {
        const payload = typeof options === 'string' ? { content: options } : options;
        if (this.isPrefix) {
            try {
                if ('send' in this.channel) {
                    await (this.channel as any).send(payload as any);
                }
            } catch {
                // Ignore perms issues
            }
        } else {
            // For slash commands, use ephemeral
            (payload as any).flags = ((payload as any).flags || 0) | MessageFlags.Ephemeral;
            if (this.interaction!.deferred || this.interaction!.replied) {
                await this.interaction!.followUp(payload);
            } else {
                await this.interaction!.reply(payload);
            }
        }
    }
}
