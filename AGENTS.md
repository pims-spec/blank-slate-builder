<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Colleague email invitations use an admin-verified server function and Cloud Auth invitation links to a public activation page; assign access in the protected roles table, never in auth metadata, to prevent privilege escalation.
- Bloxs multi-owner imports create a separate portfolio per owner and reuse the single-owner synchronization path, preserving owner references and existing GoHome mappings.
